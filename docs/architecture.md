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
│              Backend API (Node.js + Express/Fastify)   │
│  Auth · Media Proxy · Rate Limiting · Business Logic   │
└──────────────┬────────────────────────┬────────────────┘
               │                        │
┌──────────────▼──────────┐  ┌──────────▼────────────────┐
│  MongoDB (Atlas)        │  │  Scaleway Object Storage  │
│  Documents & metadata   │  │  (S3-compatible, private) │
└─────────────────────────┘  └───────────────────────────┘
```

---

## 2. Frontend

| Concern | Choice | Notes |
|---------|--------|-------|
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
| Runtime | Node.js v24 |
| Framework | Express or Fastify |
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

---

## 6. Non-Functional Targets

| Concern | Target |
|---------|--------|
| LCP (4G mobile) | < 2 s |
| Media delivery | Lazy-loaded, client-compressed before upload |
| Concurrent users | 5–20 per trip |
| Storage volume | ~10 images/user/day, ≤ 10 MB each before compression |

---

## 7. Future Improvements

The following are excluded from the initial implementation due to added complexity but should be revisited as usage grows.

### 7.1 CDN for Media Thumbnails
**Current:** Every image load hits the backend to generate a signed URL, then redirects to S3.
**Recommendation:** Pre-generate fixed-size thumbnails on upload (e.g., 800 px wide) and serve them via a CDN (e.g., Scaleway's CDN or Cloudflare). Reduces backend load and significantly improves perceived performance on slow mobile connections. Requires a thumbnail generation step on upload and a separate CDN-hosted URL per image size.

### 7.2 Background Job Queue for Media Processing
**Current:** Upload processing (validation, compression, S3 write) happens inline in the request handler.
**Recommendation:** Accept the upload, store the raw file temporarily, enqueue a job, and return immediately. A worker processes the file asynchronously. Prevents request timeouts on large files and enables retry logic. A simple in-process queue (e.g., `bullmq` backed by Redis) is sufficient at this scale. Also becomes necessary if thumbnail generation (7.1) is adopted.
