# End-to-end tests

## Stack

- **API**: `e2e/global-setup.ts` builds and runs `packages/server/dist/index.js` before tests.
- **Infra**: `e2e/global-setup.ts` starts isolated MongoDB + MinIO containers via Testcontainers per run and injects their mapped ports into the API process.
- **Env**: Root [`.env.e2e`](../.env.e2e) is parsed in [`playwright.config.ts`](../playwright.config.ts) and only fills missing keys in `process.env`; this keeps shell overrides explicit while preventing `packages/server/.env.local` coupling in e2e.
- **Default port**: `SERVER_PORT` is **3101** in `.env.e2e` (see `global-setup.ts` fallbacks).
- **Browser**: Playwright starts **only the Vite client** via `pnpm --filter @travel-journal/client exec vite --port <port>` (default **5173**, override with `E2E_VITE_PORT` if that port is busy) and sets `E2E_API_ORIGIN`, `E2E_DISABLE_RATE_LIMIT`, and `TRAVEL_JOURNAL_E2E=1` (see `playwright.config.ts`) so Vite proxies `/api` to the global-setup API and uses [`packages/client/e2e-env/.env`](../packages/client/e2e-env/.env) instead of `packages/client/.env.local`.
- **Client port selection**: `pnpm e2e` now runs through `e2e/run-e2e.mjs`, which picks a free Vite port automatically (tries `E2E_VITE_PORT`/`5173`, then falls back to `4173-4272`).
- **MongoDB**: `MONGODB_URI` is generated per run in global setup and shared with teardown through runtime state.

## Local run

Requires Docker running locally. You do **not** need to pre-start MongoDB/MinIO containers.

Media tests use a tiny PNG fixture because minimal JPEGs may fail to decode in headless Chromium before upload.

```bash
pnpm --filter @travel-journal/shared build
pnpm --filter @travel-journal/server build
pnpm e2e
```

CI uses `pnpm e2e:ci` to reuse GitHub Actions `services:` containers (no Testcontainers in CI bootstrap).  
That script loads values from [`.env.ci`](../.env.ci).

### Reusing an existing Vite server (`reuseExistingServer`)

By default, e2e does **not** reuse existing Vite servers to avoid accidental coupling with local dev.  
To opt in (advanced), set `E2E_REUSE_EXISTING_SERVER=1`. If enabled, your running server must proxy `/api` to the same e2e API port, e.g.:

```bash
E2E_API_ORIGIN=http://localhost:3101 E2E_DISABLE_RATE_LIMIT=1 TRAVEL_JOURNAL_E2E=1 pnpm --filter @travel-journal/client dev
```

Full `pnpm dev` (client + API on 3100) does not match the e2e API on 3101 unless you align `SERVER_PORT` and `E2E_API_ORIGIN` yourself.

### Troubleshooting

- If e2e fails before tests start with container errors, verify Docker daemon is up (`docker ps`).
- If setup hangs, run with container debug logs enabled: `DEBUG=testcontainers* pnpm e2e`.
