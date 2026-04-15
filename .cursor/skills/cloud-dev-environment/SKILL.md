---
name: cloud-dev-environment
description: Cursor Cloud dev-environment setup and operations. Use when setting up the development environment, starting dev servers, running tests, or debugging infrastructure issues in a Cloud VM.
---

# Cloud Dev Environment

## Architecture overview

pnpm monorepo with three workspace packages (`packages/shared`, `packages/server`, `packages/client`) plus Playwright E2E tests in `e2e/`. See `docs/architecture.md` for full details.

## Infrastructure

Docker is required. MongoDB 8 and MinIO (S3-compatible) run via `docker compose up -d` from the repo root. The `createbuckets` init container auto-creates the `travel-journal` S3 bucket.

## Server `.env.local`

The Express server reads `packages/server/.env.local` (gitignored). Create it with at minimum:

```
ADMIN_EMAIL=admin@localhost
JWT_SECRET=dev-secret
S3_ENDPOINT=http://localhost:9100
S3_BUCKET=travel-journal
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
MONGODB_URI=mongodb://localhost:27017/travel-journal
```

Without `ADMIN_EMAIL`, the admin bootstrap registration endpoint returns 403.

## Key commands

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Build shared types (required before server/client) | `pnpm --filter @travel-journal/shared build` |
| Dev servers (API + Vite) | `pnpm dev` |
| Lint + typecheck | `pnpm lint` |
| Unit tests (server + client) | `pnpm test` |
| E2E tests (requires Docker) | `pnpm e2e` |

## Gotchas

- The `@travel-journal/shared` package **must be built** before running server or client (`pnpm --filter @travel-journal/shared build`). Without this, imports from `@travel-journal/shared` fail.
- pnpm 10 blocks build scripts by default. The root `package.json` field `pnpm.onlyBuiltDependencies` allowlists packages that need postinstall/install scripts (sharp, mongodb-memory-server, etc.). If a new native dependency is added and its build script is blocked, add it to that list.
- Server unit tests use `mongodb-memory-server` (embedded MongoDB binary) — no external MongoDB needed. Client unit tests use `msw` + `happy-dom` — no external services needed.
- Two client tests (`EntryCard.test.tsx` and `ImageReorder.test.tsx`) have pre-existing failures related to `createObjectURL` not being available in the jsdom/happy-dom test environment. These are not regressions.
- Docker daemon in nested container environments needs `fuse-overlayfs` storage driver and `iptables-legacy`. See the `daemon.json` and `update-alternatives` setup in the VM snapshot.
