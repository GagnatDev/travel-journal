# Travel Journal PWA – Architecture

## 1. System Overview

The application follows a classic three-tier architecture: a React PWA client, a Node.js API server, and persistent storage (MongoDB + S3-compatible object storage). All client-server communication goes through the REST API — clients never access storage directly.

```
┌────────────────────────────────────────────────────────┐
│                  Client (React PWA)                    │
│  Service Worker · react-i18next · dual-token auth      │
└────────────────────────┬───────────────────────────────┘
                         │ HTTPS / REST
┌────────────────────────▼───────────────────────────────┐
│              Backend API (Node.js + Express)           │
│  Auth · Media Proxy · Rate Limiting · Business Logic   │
└──────────────┬────────────────────────┬────────────────┘
               │                        │
┌──────────────▼──────────┐  ┌──────────▼────────────────┐
│  MongoDB (Atlas)        │  │  Scaleway Object Storage  │
│  Documents & metadata   │  │  (S3-compatible, private) │
└─────────────────────────┘  └───────────────────────────┘
```

### Repository Layout

pnpm workspaces monorepo with three packages:

```
packages/
  shared/   # TypeScript types shared by client and server (no runtime code)
  client/   # React PWA (Vite)
  server/   # Node.js API (Express)
pnpm-workspace.yaml
package.json          # root — shared devDependencies (TypeScript, ESLint, Prettier)
docker-compose.yml
Dockerfile
```

`packages/shared` is the canonical source for API request/response shapes and domain types. Both `client` and `server` depend on it as a workspace package (`"@travel-journal/shared": "workspace:*"`), eliminating type drift between the two sides.

`packages/shared` must be compiled with `"composite": true` in its `tsconfig.json`, and both `client` and `server` must reference it via TypeScript project references (`"references": [{ "path": "../shared" }]`). Without this, changes to shared types require a manual rebuild of `shared` before the consuming packages see them.

---

## 2. Frontend

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript | Strict mode; types shared with server via `@travel-journal/shared` |
| Framework | React | |
| Styling | Tailwind CSS | Tokens derived from `docs/design_guidelines.md`; implemented as CSS variables for theming |
| i18n | `react-i18next` + `i18next` | Locales: `nb` (default), `en`; translation files at `public/locales/{nb,en}/translation.json` |
| PWA | Service Worker + Web App Manifest | Offline caching, background sync (Phase 2), push (Phase 2) |
| State | TBD (React Query recommended) | Server-state caching aligns well with offline sync requirements |

### Language Detection Order
1. `preferredLocale` from the authenticated user's profile (synced from the database on login; cached in `localStorage` for immediate access on subsequent loads)
2. Browser `Accept-Language` header (first visit only, before any account exists)
3. Fallback to `nb`

### PWA Offline Strategy
- **App shell:** cache-first via service worker
- **API responses:** network-first with fallback to cache
- **Entry creation offline:** write to IndexedDB queue; flush on reconnect via Background Sync API (Phase 2)
- **Conflict resolution:** last-write-wins (LWW) per entry, server timestamp as tie-breaker; overwritten version preserved in `editHistory` (Phase 2)

---

## 3. Backend

| Concern | Choice |
|---------|--------|
| Language | TypeScript | 
| Runtime | Node.js v24 |
| Framework | Express |
| Database | MongoDB (Atlas managed) |
| Object storage | Scaleway Object Storage (S3-compatible) |
| Auth | Dual-token: 15-min JWT access token (in memory) + 30-day refresh token (`HttpOnly` cookie) |

### API Design
- RESTful JSON API
- All routes under `/api/v1/` — versioned from day one to allow non-breaking evolution
- Authentication header: `Authorization: Bearer <token>`

### Media Proxy
All S3 access is mediated by the backend. Clients never hold permanent S3 URLs.

**Upload flow:**
```
Client → POST /api/v1/media/upload (multipart)
       → Backend validates type & size
       → Backend compresses if needed
       → Backend streams to S3
       → Returns { key, url: "/api/v1/media/:key" }
```

**Download flow:**
```
Client → GET /api/v1/media/:key
       → Backend verifies trip membership
       → Backend generates signed S3 URL (1-hour TTL)
       → 302 redirect to signed URL
```

Storing only the `key` in the database (not the full S3 URL or the signed URL) means the proxy endpoint is the stable reference — signed URLs are generated on demand and never persisted.

### Rate Limiting
Applied to:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register` (admin bootstrap)
- `POST /api/v1/invites/accept`
- `POST /api/v1/media/upload`

Recommended limits: 10 requests/minute on auth endpoints; 30 requests/minute on media upload per authenticated user.

### Structured Logging & Request Tracing

Every request is assigned a UUID `requestId` at the middleware layer:

- Returned in every API response as the `X-Request-Id` header
- Logged alongside every server-side log entry (structured JSON via `pino` or equivalent)
- Newline-delimited JSON output is compatible with Scaleway's log aggregation

### Health & Readiness Endpoints

- `GET /healthz` — liveness probe; returns `200 OK` if the process is alive
- `GET /readyz` — readiness probe; checks MongoDB connectivity; returns `200 OK` or `503 Service Unavailable`

Required by Scaleway Serverless Containers for zero-downtime rolling deployments.

### Image Ordering
Images within an entry are stored as an ordered array (max 10). On save the client sends the complete array in display order; the backend normalizes `order` values to sequential integers (0–9) and atomically replaces the array. No fractional indexing required at this scale.

---

## 4. Authentication & Authorization

### Session Model

Two tokens are issued on every successful login:

| Token | Type | Expiry | Storage | Used for |
|-------|------|--------|---------|----------|
| **Access token** | JWT; payload `{ userId, email, appRole }` | 15 min | JS memory only | `Authorization: Bearer` header on every API call |
| **Refresh token** | Opaque random 32-byte hex string | 30 days | `HttpOnly Secure SameSite=Strict` cookie | Exchanged at `POST /api/v1/auth/refresh` for a new access token |

The raw refresh token is never stored on the server — only its SHA-256 hash is written to the `Session` collection (see [data model](data_model.md)), enabling server-side revocation.

- **Auto-login:** on app load, if no access token is in memory, silently call the refresh endpoint. If the `HttpOnly` cookie is valid, a new access token is issued without prompting the user.
- **Logout:** client discards the access token from memory; server deletes the `Session` document and instructs the browser to clear the cookie.
- **Token rotation:** the refresh token is rotated (new token issued, old one revoked) on each successful refresh call, limiting the blast radius of a stolen cookie.

### Admin Bootstrap
The very first account is bootstrapped via the `ADMIN_EMAIL` environment variable (server-side only, never exposed to clients). The `/api/v1/auth/register` route is disabled once an admin account exists.

### Authorization Matrix

| Action | Admin | Creator | Follower (app-level) | Notes |
|--------|-------|---------|----------------------|-------|
| Create a trip | ✅ | ✅ | ❌ | |
| Invite new user to platform | ✅ | ❌ | ❌ | Admin Panel only |
| Promote follower → creator | ✅ | ❌ | ❌ | Admin Panel only |
| Add member to a trip | Trip creator | Trip creator | ❌ | Regardless of app role |
| Post entries | If trip role ∈ {contributor, creator} | If trip role ∈ {contributor, creator} | If trip role = contributor | |
| Edit/delete own entries | ✅ (if contributor/creator) | ✅ (if contributor/creator) | ❌ | Authors only |
| Edit/delete others' entries | ❌ | ❌ | ❌ | |
| Change trip settings | Trip creator | Trip creator | ❌ | |
| View trip timeline | Any authenticated member | Any authenticated member | Any authenticated member | All trip roles can read |

---

## 5. Deployment

### 5.1 Container Image

The application ships as a **single Docker image** built in two stages:

1. **Build stage** — copies workspace manifests first (for layer caching), runs `pnpm install --frozen-lockfile`, compiles `packages/shared` and `packages/server`, and runs `vite build` for `packages/client`; produces compiled server code and static client assets.
2. **Runtime stage** — copies only the compiled output into a slim Node.js image. The server serves the frontend static assets via `express.static` and the API under `/api/v1/`. No separate static host or CDN origin is required.

The Dockerfile copies workspace manifests in dependency order before installing to maximise Docker layer cache reuse:

```dockerfile
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages/ packages/
# then build steps
```

| Layer | Service |
|-------|---------|
| Compute | Scaleway Serverless Containers |
| Object storage | Scaleway Object Storage (private bucket) |
| Database | MongoDB Atlas (external managed) |

Environment variables required at runtime:
- `ADMIN_EMAIL` — bootstraps the first admin account
- `JWT_SECRET` — signs and verifies tokens
- `MONGODB_URI` — Atlas connection string
- `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` — object storage credentials

### 5.2 Local Development — Docker Compose

`docker-compose.yml` starts the external dependencies only. The app server runs from source so hot-reload works normally.

```
services:
  mongodb      mongo:8 — data on a named volume; exposed on 27017
  minio        minio/minio — S3 API on 9000, web console on 9001
  createbuckets  one-shot minio/mc container; waits for MinIO, creates the bucket, exits
```

Typical workflow:

```bash
docker compose up -d   # start MongoDB + MinIO
pnpm dev               # root script — starts server and client concurrently
```

The root `dev` script runs both workspace packages in parallel:

```
pnpm --filter @travel-journal/server dev   → tsc watch + nodemon
pnpm --filter @travel-journal/client dev   → Vite dev server (HMR)
```

`packages/server/.env.local` (git-ignored):

```
MONGODB_URI=mongodb://localhost:27017/travel-journal
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=travel-journal
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
JWT_SECRET=dev-secret
ADMIN_EMAIL=admin@localhost
```

### 5.3 CI Pipeline — `.github/workflows/ci.yml`

Triggered on every push and pull request to `main`. Jobs:

| Job | What it does |
|-----|-------------|
| `lint` | ESLint + TypeScript type-check |
| `unit` | Vitest (unit + component tests); no external services required |
| `e2e` | Playwright full-stack suite (see §7.3); MongoDB and MinIO run as GitHub Actions `services:` |
| `build` | `docker build` — validates the image; no push on PRs |

`lint`, `unit`, and `build` run in parallel. `e2e` runs after `unit` passes.

On merge to `main`, a separate `deploy.yml` builds, tags, and pushes the image to the container registry, then triggers a Scaleway redeployment.

---

## 6. Non-Functional Targets

| Concern | Target |
|---------|--------|
| LCP (4G mobile) | < 2 s |
| Media delivery | Lazy-loaded, client-compressed before upload |
| Concurrent users | 5–20 per trip |
| Storage volume | ~10 images/user/day, ≤ 10 MB each before compression |

---

## 7. Testing Strategy

Three layers of tests, each with a distinct role.

### 7.1 Unit Tests — Vitest

Covers pure logic: utilities, hooks, data-transformation functions, and backend service functions.

- **Runner:** Vitest (native ESM, shares the Vite config — no separate transpilation step)
- **DOM environment:** `happy-dom` for any test that touches browser APIs
- Scope is intentionally narrow: no Express routing, no database, no rendering.

### 7.2 Component Tests — Vitest + React Testing Library

Covers React components in isolation: rendering, user interactions, and conditional display logic.

- **Library:** `@testing-library/react` with `@testing-library/user-event`
- Queries follow the [priority order](https://testing-library.com/docs/queries/about/#priority): by role → by label → by text → by test id. Tests assert what the user sees and can do, not implementation details.
- Network calls are intercepted with `msw` (Mock Service Worker) — handlers return realistic fixture data so components render in a predictable state without a running server.

**On alternatives:** Enzyme is legacy and has no meaningful React 18 support. Cypress Component Testing renders in a real browser but adds a second toolchain alongside Playwright; the jsdom fidelity of Testing Library is sufficient at this layer. Storybook interaction tests are worth revisiting if Storybook is adopted for design-system work.

### 7.3 End-to-End Tests — Playwright

Covers complete user journeys through the real UI, a real running backend, **real MongoDB**, and **real MinIO** — no mocking at the database or storage layer.

**Test environment setup:**

- Locally: `docker compose up -d` starts MongoDB and MinIO (same services as §5.2).
- In CI: the same services run as GitHub Actions `services:` containers, keeping local and CI behaviour identical.
- Playwright's `globalSetup` script then:
  1. Ensures the MinIO bucket exists (idempotent `CreateBucket` call via the AWS SDK).
  2. Starts the Express server as a child process with `NODE_ENV=test`, a fresh `MONGODB_URI` pointing at the test database, and a test-only `JWT_SECRET`.
  3. Polls `GET /healthz` until the server is ready.
  4. Seeds the minimum required state: one admin user, one test trip.
- `globalTeardown` kills the server process and drops the test database. The MinIO container is discarded by CI; locally, it persists between runs (objects accumulate but do not affect test correctness).

**Test isolation:**
Each spec file calls a shared `resetCollections(...names)` helper in `beforeEach` that truncates only the collections it writes to, rather than dropping the whole database. This keeps suite runtime reasonable while preventing cross-spec state bleed.

**Authentication shortcut:**
Each spec seeds its required users via the API in `beforeAll` and saves the resulting `HttpOnly` cookie to Playwright's storage state, bypassing the login UI in every spec except the dedicated auth suite.

**Scope:** login/logout, creating a trip, posting/editing entries, uploading and viewing media, and inviting a member. Tests assert on visible text, headings, and accessible roles — not on DOM structure or CSS class names.

**Why real services over `mongodb-memory-server` / S3 SDK mocks:**
- `mongodb-memory-server` bundles its own MongoDB binary; version drift can silently hide query planner or index behaviour differences.
- Mocking the S3 SDK at the process level skips presigned-URL generation, multipart handling, and content-type enforcement — exactly the code paths most likely to fail in production.
- MinIO is a drop-in S3 replacement: no application code changes are needed, only a different `S3_ENDPOINT`. The full upload → proxy → signed-URL redirect flow is exercised end-to-end.

---

## 8. Future Improvements

The following are excluded from the initial implementation due to added complexity but should be revisited as usage grows.

### 8.1 CDN for Media Thumbnails
**Current:** Every image load hits the backend to generate a signed URL, then redirects to S3.
**Recommendation:** Pre-generate fixed-size thumbnails on upload (e.g., 800 px wide) and serve them via a CDN (e.g., Scaleway's CDN or Cloudflare). Reduces backend load and significantly improves perceived performance on slow mobile connections. Requires a thumbnail generation step on upload and a separate CDN-hosted URL per image size.

### 8.2 Background Job Queue for Media Processing
**Current:** Upload processing (validation, compression, S3 write) happens inline in the request handler.
**Recommendation:** Accept the upload, store the raw file temporarily, enqueue a job, and return immediately. A worker processes the file asynchronously. Prevents request timeouts on large files and enables retry logic. A simple in-process queue (e.g., `bullmq` backed by Redis) is sufficient at this scale. Also becomes necessary if thumbnail generation (7.1) is adopted.
