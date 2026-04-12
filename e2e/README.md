# End-to-end tests

## Stack

- **API**: `e2e/global-setup.ts` builds and runs `packages/server/dist/index.js` before tests.
- **Env**: Root [`.env.e2e`](../.env.e2e) is parsed in [`playwright.config.ts`](../playwright.config.ts) and applied to `process.env` (overwriting existing keys for each entry in the file), so you do not need to change `packages/server/.env.local` or shell exports to match e2e. Keep that file in sync with CI (same values as the former inline e2e `env` in `.github/workflows/ci.yml`).
- **Default port**: `SERVER_PORT` is **3101** in `.env.e2e` (see `global-setup.ts` fallbacks).
- **Browser**: Playwright starts **only the Vite client** via `pnpm --filter @travel-journal/client exec vite --port <port>` (default **5173**, override with `E2E_VITE_PORT` if that port is busy) and sets `E2E_API_ORIGIN`, `E2E_DISABLE_RATE_LIMIT`, and `TRAVEL_JOURNAL_E2E=1` (see `playwright.config.ts`) so Vite proxies `/api` to the global-setup API and uses [`packages/client/e2e-env/.env`](../packages/client/e2e-env/.env) instead of `packages/client/.env.local`.
- **MongoDB**: `MONGODB_URI` must be the same for the Node test runner (including `resetCollections` / `global-teardown`) and the API process. Default / `.env.e2e`: `mongodb://localhost:27017/travel-journal-test`.

## Local run

Requires MongoDB and MinIO (or compatible S3) matching `S3_*` in `.env.e2e`, unless you override env (advanced).

Media tests use a tiny PNG fixture because minimal JPEGs may fail to decode in headless Chromium before upload.

```bash
pnpm --filter @travel-journal/shared build
pnpm --filter @travel-journal/server build
pnpm e2e
```

### Reusing an existing Vite server (`reuseExistingServer`)

If a dev server on port 5173 is already running, Playwright may skip starting its own. That server must proxy `/api` to the **same** port as global-setup (default **3101**) and use the same e2e Vite env dir contract, e.g.:

```bash
E2E_API_ORIGIN=http://localhost:3101 E2E_DISABLE_RATE_LIMIT=1 TRAVEL_JOURNAL_E2E=1 pnpm --filter @travel-journal/client dev
```

Full `pnpm dev` (client + API on 3100) does not match the e2e API on 3101 unless you align `SERVER_PORT`, `E2E_API_ORIGIN`, and MongoDB yourself.
