# End-to-end tests

## Stack

- **API**: `e2e/global-setup.ts` builds and runs `packages/server/dist/index.js` before tests.
- **Default port**: `SERVER_PORT` is **3101** if unset (see `global-setup.ts`).
- **Browser**: Playwright starts **only the Vite client** (`pnpm --filter @travel-journal/client dev`) and sets `E2E_API_ORIGIN=http://localhost:<SERVER_PORT>` (see `playwright.config.ts`) so Vite proxies `/api` to the global-setup API.
- **MongoDB**: `MONGODB_URI` must be the same for the Node test runner (including `resetCollections` / `global-teardown`) and the API process. Defaults to `mongodb://localhost:27017/travel-journal-e2e` when unset. CI overrides this in `.github/workflows/ci.yml`.

## Local run

Requires MongoDB and MinIO (or compatible S3) matching `S3_*` defaults in `global-setup.ts`, unless you override env.

Media tests use a tiny PNG fixture because minimal JPEGs may fail to decode in headless Chromium before upload.

```bash
pnpm --filter @travel-journal/shared build
pnpm --filter @travel-journal/server build
pnpm e2e
```

### Reusing an existing Vite server (`reuseExistingServer`)

If a dev server on port 5173 is already running, Playwright may skip starting its own. That server must proxy `/api` to the **same** port as global-setup (default **3101**), e.g.:

```bash
E2E_API_ORIGIN=http://localhost:3101 pnpm --filter @travel-journal/client dev
```

Full `pnpm dev` (client + API on 3100) does not match the e2e API on 3101 unless you align `SERVER_PORT`, `E2E_API_ORIGIN`, and MongoDB yourself.
