# Preparing for the homectl-auth sidecar — PWA auth-loop safety

Travel Journal will eventually move its hand-rolled auth (HS256 JWT + refresh
cookie + Mongo `Session`) behind the centralized homectl-auth **forward-auth
sidecar** (`homectl-auth-proxy`), as described in homectl-reference
(`docs/authentication.md`, skill `migrate-to-homectl-auth`; the app id is
`reisedagbok`). This document covers the *preparation* landed ahead of that
migration: making sure the installed PWA cannot get stuck in an auth loop once
an auth proxy sits in front of the app. Nothing here changes the current auth
model — the app still runs its own login.

## Why a PWA + auth sidecar can deadlock

The sidecar's contract: a top-level HTML navigation without a valid session is
`302`-redirected to central login; an XHR without a session gets a `401`. A
plain SPA recovers naturally — reload, get redirected, log in, come back. An
installed PWA does not, for three reasons:

1. **The app shell never touches the network.** The service worker precaches
   `index.html`, and `start_url: '/'` is answered from the precache
   (Workbox `directoryIndex`). Launching the PWA or reloading it therefore
   *never* produces the top-level navigation the sidecar needs to run the OAuth
   flow. With an expired session the app boots from cache, every API call
   fails, a reload boots from cache again — an unrecoverable loop.
   *Consequence:* interactive re-login must be an explicit **full-page
   navigation to a sidecar-owned path** (e.g. `/auth/login`) that the service
   worker is guaranteed not to intercept.

2. **`fetch` follows redirects into a CORS wall.** If an API XHR is ever
   answered with the sidecar's `302` to `auth.homectl.no` (e.g. the XHR
   heuristic misfires), `fetch` follows it cross-origin and rejects with a
   CORS/network error. Our client deliberately treats fetch rejections as
   "offline, keep the user in the cached experience" — so an expired session
   would masquerade as being offline and the user would be stranded on stale
   cached data indefinitely, never prompted to log in.

3. **Caches can be poisoned by auth responses.** Workbox's default cacheable
   statuses are `[0, 200]`. A redirect chased to a login page yields a `200`
   HTML body (or an opaque `0` response); cached into the trips/media runtime
   caches it would be served as data — including offline, where nothing can
   evict it.

## What was prepared (this change)

| Concern | Where | Behavior |
|---|---|---|
| SW never intercepts auth traffic | `packages/client/src/sw.ts`, `src/auth/authPaths.ts` | `NetworkOnly` route for `/api/v1/auth/*` (today) and `/auth/*` (sidecar-owned: `/auth/login`, `/auth/callback`, `/auth/logout`), registered ahead of all other routes. |
| Runtime caches only store clean data | `src/pwa/swCachePolicy.ts` | `api-trips` and `media` caches admit only status-200, non-redirected, non-HTML responses — a login page can never be cached as API data. |
| Auth redirects ≠ offline | `src/api/client.ts` | API fetches use `redirect: 'manual'`; an `opaqueredirect`/3xx answer dispatches `auth:session-expired` instead of surfacing as a `NetworkError`. Inert today (our JSON API never redirects), load-bearing behind the sidecar. |
| Loop-guarded interactive login | `src/auth/loginRedirect.ts`, `src/context/AuthContext.tsx` | Session expiry escalates through one function. With `VITE_AUTH_LOGIN_URL` unset (today) it routes to the in-app `/login` screen, unchanged. When set, it becomes a full-page `location.assign` to that URL with `?rd=<return path>` — rate-limited via `sessionStorage` (3 per minute) so a broken cookie flow (e.g. iOS PWA webview refusing the session cookie) degrades to a visible error state instead of an infinite redirect ping-pong between app and IdP. |

Invariants to preserve until and during the migration:

- **Never add a navigation fallback** (`NavigationRoute` / `navigateFallback`)
  to the production service worker without denylisting `/auth/*` and `/api/*`.
  Today deep-link navigations intentionally pass through to the network, which
  is exactly what lets the sidecar run interactive login.
- Auth endpoints must stay excluded from every SW cache and route.
- Session-expiry handling must go through `beginInteractiveLogin` — do not
  reintroduce ad-hoc `navigate('/login')` or `location.reload()` calls for
  auth recovery.

## What the actual migration still needs (out of scope here)

Per homectl-reference `skills/migrate-to-homectl-auth`:

1. Register `reisedagbok` in the auth service's `apps.json`; provision
   `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` / `COOKIE_KEY` (Terraform `auth = true`).
2. Deploy the `homectl-auth-proxy` sidecar in front of the app
   (`ingress → sidecar:4180 → app`; app port never exposed directly).
3. Replace the server's JWT verification with reading the injected
   `X-Homectl-*` headers + JIT-link the Mongo `User` (by email or stored
   `auth_sub`).
4. Backfill/import existing users into homectl-auth.
5. Frontend cutover: set `VITE_AUTH_LOGIN_URL=/auth/login`, drop the login
   form, token store, and refresh flow; API calls become plain same-origin
   fetches. Decide the `suppressed`-escalation UI (the in-app `/login` screen
   goes away with the custom auth).
6. Remove `/api/v1/auth/*`, the `Session` collection, and `JWT_SECRET`.
