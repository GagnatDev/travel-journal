# Object storage

All media (`media/<tripId>/…`), avatars (`avatars/<userId>/…`) and generated photobook
PDFs (`pdf/<tripId>/…`) live in an S3-compatible bucket. The server reaches it only
through the **storage facade** in `packages/server/src/storage/`:

| File | Role |
|---|---|
| `objectStore.ts` | The `ObjectStore` interface: `put`, `get`, `head`, `delete`, `presignGet`, `list` |
| `s3ObjectStore.ts` | One S3 bucket (Scaleway Object Storage, or MinIO locally) |
| `routedObjectStore.ts` | Routes each operation to the right bucket for the current `STORAGE_MODE` |
| `config.ts` | Reads and validates the env (below) |
| `index.ts` | `getObjectStore()` singleton; `initObjectStore()` validates at boot |
| `migrate.ts` + `scripts/storage-migrate.ts` | Idempotent bucket-to-bucket copy |

Business code (`services/media.service.ts`) never imports an S3 client or names a
bucket. MongoDB stores only keys, never bucket names or URLs, so **moving to another
bucket needs no database migration**, only an object copy.

## Why a facade

Travel Journal is moving from a Scaleway Serverless Container to the homectl
Kapsule cluster (#155). At first it keeps using the bucket it has today, outside the
cluster ("legacy"). Later it moves to the Terraform-managed in-cluster bucket
`homectl-reisedagbok` ("homectl"). The facade makes that move a config change plus a
copy job, with no code change and no downtime.

## Modes (`STORAGE_MODE`)

| Mode | Writes | Reads (`get` / `head` / `presignGet`) | Deletes |
|---|---|---|---|
| *(unset)* | the one bucket from `S3_*` | same | same |
| `legacy` | legacy | legacy | legacy |
| `migrating` | homectl | homectl, **falling back to legacy** when the object isn't there | both |
| `homectl` | homectl | homectl | homectl |

- **Unset** is the pre-facade behaviour: a single bucket from `S3_*`, with local MinIO
  defaults (`http://localhost:9100`, bucket `travel-journal`, `minioadmin`). The
  Serverless deploy, local dev, CI and e2e all run like this, unchanged.
- In `migrating`, every read served from legacy logs
  `Storage read fell back to legacy bucket` (with `op` and `key`). That count should
  drop to zero once the copy is complete.
- Deletes in `migrating` hit both buckets, so a deleted object can't come back through
  the legacy fallback.

## Environment

| Variable | Used by | Notes |
|---|---|---|
| `STORAGE_MODE` | all | `legacy` \| `migrating` \| `homectl`; unset = pre-facade single bucket |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | homectl (or the single bucket when unset) | On the cluster these come from Terraform (`reisedagbok-terraform-secrets`), so `S3_*` always means `homectl-reisedagbok` |
| `S3_REGION` | | Terraform sets `fr-par`; defaults to `us-east-1` (the pre-facade value) |
| `S3_FORCE_PATH_STYLE` | | Default `true` (needed for MinIO, fine on Scaleway) |
| `LEGACY_S3_ENDPOINT`, `LEGACY_S3_BUCKET`, `LEGACY_S3_ACCESS_KEY`, `LEGACY_S3_SECRET_KEY` | legacy, migrating | The bucket outside the cluster; hand-managed in `reisedagbok-secrets` |
| `LEGACY_S3_REGION`, `LEGACY_S3_FORCE_PATH_STYLE` | | Same defaults as above |

With `STORAGE_MODE` set, the required variables have **no defaults**. The server
validates them at boot and refuses to start with a message naming what's missing.
`legacy` never falls back to `S3_*`, so a missing hand-managed Secret can't silently
point legacy reads at the new bucket. `migrating` also refuses two configs that point
at the same bucket. The boot log line `Object storage configured` shows the mode,
endpoints and buckets, never credentials.

## Bucket migration runbook (legacy → homectl)

Run on the cluster once the app is serving from there in `legacy` mode.

1. **Switch writes.** Set `STORAGE_MODE=migrating` (both `LEGACY_S3_*` and `S3_*`
   present) and roll out. New uploads land in `homectl-reisedagbok`; old objects keep
   being served from legacy.
2. **Copy.** Dry run first, then for real. Re-run until it reports
   `copied: 0, failed: 0`:
   ```sh
   # in the pod (same image + Secrets), or as a one-off Job
   node packages/server/dist/scripts/storage-migrate.js --dry-run
   node packages/server/dist/scripts/storage-migrate.js [--prefix=media/] [--concurrency=4]
   # locally, with both credential sets in packages/server/.env.local
   pnpm --filter @travel-journal/server build
   pnpm --filter @travel-journal/server storage:migrate -- --dry-run
   ```
   The copy streams each object (get → put) with its content type, so the buckets may
   be on different endpoints with different keys. Objects already present with the
   same size and ETag are skipped. It prints a JSON summary
   (`scanned` / `copied` / `skipped` / `failed` / `bytesCopied`), exits `1` if anything
   failed and `2` on bad config or arguments.
3. **Verify.** The legacy-fallback log line should stop appearing. Spot-check object
   counts per prefix in both buckets.
4. **Cut over.** Set `STORAGE_MODE=homectl`, roll out, and remove `LEGACY_S3_*` from
   `reisedagbok-secrets`.
5. **Retire.** Keep the legacy bucket read-only for a grace period, then delete it and
   its key. Bucket CORS (`.scaleway/`, `put-bucket-cors.yml`) isn't needed: browsers
   never talk to the bucket directly.

**Rollback:** until step 4, going back to `legacy` is safe for everything except
objects uploaded during `migrating`, which exist only in homectl. Run the copy in the
other direction (swap the two env sets) before switching back.

## Local development

Nothing to configure: with `STORAGE_MODE` unset, the server uses the MinIO bucket from
`docker compose up -d`. To exercise `migrating` locally, create a second bucket in
MinIO (console on <http://localhost:9101>) and set `STORAGE_MODE=migrating` with
`LEGACY_S3_*` pointing at one bucket and `S3_*` at the other in
`packages/server/.env.local`.
