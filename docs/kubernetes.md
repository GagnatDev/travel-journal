# Running on the homectl cluster

Travel Journal runs on the shared homectl Kapsule cluster as **`reisedagbok`**
(`reisedagbok.homectl.no`, namespace `homectl`). Migration plan and status: #155.

| File | What |
|---|---|
| `k8s/deployment.yml` | Deployment + Service + Ingress |
| `.github/workflows/deploy-k8s.yml` | Build → push `rg.fr-par.scw.cloud/homectl/reisedagbok` → `kubectl apply` → rollout |
| `docs/storage.md` | `STORAGE_MODE` and the bucket move |

How it differs from the homectl template (`homectl-reference/templates/k8s/deployment.yml`):

- **No auth sidecar.** The app keeps its own login, so the Service targets the app
  directly: ingress → Service:80 → app:**8084**. The port is deliberate; every homectl
  app has its own (homectl-reference `docs/local-ports.md`).
- **One replica.** The daily digest cron and the photobook PDF job run in-process.
- **Probes:** `/health` (process only) for startup and liveness, and `/readyz` (pings
  MongoDB) for readiness. A MongoDB outage takes the pod out of the Service without
  restarting it.
- **Upload size:** the Ingress allows 12 MB request bodies. Photos are uploaded through
  the server; ingress-nginx's default 1 MB would reject them with 413.
- **Graceful shutdown:** on SIGTERM the server stops accepting connections, lets
  in-flight requests finish, stops the cron and closes MongoDB (25s deadline, 30s
  grace period). The image runs as the unprivileged `node` user.

## Secrets

**Repo (GitHub Actions):** `K8S_SCW_ACCESS_KEY`, `K8S_SCW_SECRET_KEY` (homectl API key
with registry push and cluster access), `SCW_ORGANIZATION_ID`, `SCW_PROJECT_ID`,
`K8S_CLUSTER_ID`, plus the existing `APP_VITE_MAPBOX_TOKEN`. The key has a `K8S_`
prefix so it doesn't replace `SCW_SECRET_KEY`, which the Serverless workflows
(`deploy.yml` until cutover, `deploy-dev.yml` for good) keep using.

**Cluster (namespace `homectl`):**

| Secret | Managed by | Keys |
|---|---|---|
| `reisedagbok-terraform-secrets` | Terraform (homectl-infra) | `S3_*` for `homectl-reisedagbok` |
| `reisedagbok-vapid-secrets` | Terraform (homectl-infra) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `reisedagbok-secrets` | by hand (below) | everything else |

Create the hand-managed Secret with the values from the Serverless deploy (the `APP_*`
GitHub secrets). Never commit them.

```sh
scw k8s kubeconfig install <K8S_CLUSTER_ID> region=fr-par
kubectl create secret generic reisedagbok-secrets -n homectl \
  --from-literal=MONGODB_URI='…'            `# APP_MONGODB_URI` \
  --from-literal=JWT_SECRET='…'             `# APP_JWT_SECRET — must be identical, or everyone is logged out` \
  --from-literal=ADMIN_EMAIL='…'            `# APP_ADMIN_EMAIL` \
  --from-literal=TRIP_PDF_MAPBOX_TOKEN='…'  `# APP_VITE_MAPBOX_TOKEN` \
  --from-literal=LEGACY_S3_ENDPOINT='…'     `# APP_S3_ENDPOINT` \
  --from-literal=LEGACY_S3_BUCKET=travel-journal-bucket \
  --from-literal=LEGACY_S3_ACCESS_KEY='…'   `# APP_S3_ACCESS_KEY` \
  --from-literal=LEGACY_S3_SECRET_KEY='…'   `# APP_S3_SECRET_KEY`
# plus any of PRODIGI_API_KEY, PRODIGI_BASE_URL, CORS_ORIGINS, … that production sets
```

Change a value later with `kubectl edit secret` or by re-creating it, then
`kubectl rollout restart deployment/reisedagbok -n homectl`. Secret-backed env vars
don't reload on their own.

## First deploy (DNS still on Serverless)

1. **Memory headroom.** Run `kubectl describe nodes | grep -A6 "Allocated resources"`.
   The pod requests 192Mi, and during a rolling update the old and new pod overlap,
   so leave room for **2 × 192Mi**. A pod that doesn't fit stays Pending, and the
   autoscaler then adds a second node (~€19.50/month).
2. **MongoDB access.** If MongoDB has an IP allowlist, add the cluster's egress IP.
3. **Deploy.** Actions → *Deploy to Kubernetes* → Run workflow (on `main`).
4. **Verify privately:**
   ```sh
   kubectl get pods,ingress -n homectl -l app=reisedagbok
   kubectl logs -n homectl deploy/reisedagbok   # Object storage configured (mode legacy), MongoDB connected
   kubectl port-forward -n homectl svc/reisedagbok 8084:80
   curl localhost:8084/health                   # {"status":"ok"}
   ```
   Then, through the port-forward: log in, open a timeline (media streams from
   `travel-journal-bucket`), upload a photo and an avatar, and generate a photobook
   PDF while watching `kubectl top pod -n homectl`.

## Before the DNS cutover: real client IPs

`TRUST_PROXY=1` makes Express take the client IP from the `X-Forwarded-For` header
that ingress-nginx sets. The ingress controller in homectl-infra currently runs
behind the Scaleway load balancer **without proxy protocol**, so nginx sees the load
balancer's address and not the visitor's. Then every user shares one rate-limit
bucket: login, refresh and password reset allow 10 requests/min, uploads 30/min.

Check it once the pod serves traffic. The first field of each ingress-nginx access log
line is the address nginx sees:

```sh
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=50 | grep reisedagbok
```

If every request shows the same private or load-balancer address instead of your own
public IP, enable proxy protocol v2 in
homectl-infra **before** cutover. That means the load balancer annotation
`service.beta.kubernetes.io/scw-loadbalancer-proxy-protocol-v2` plus
`use-proxy-protocol: "true"` in the ingress-nginx config. Apply both together, since
either half alone breaks every app on the cluster.

## Cutover and rollback

See #155 Phase 5. Until DNS is verified on the cluster, rollback means pointing
`reisedagbok.homectl.no` back at the Serverless container, which is unchanged.
