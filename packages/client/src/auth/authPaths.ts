/**
 * Paths the service worker must NEVER intercept, cache, or answer for.
 *
 * Auth flows only work when they reach the network: a login redirect, an OAuth
 * callback, or a token refresh that is served from a cache (or swallowed by a
 * navigation fallback) leaves the browser with a stale/absent session while the
 * app shell keeps loading from cache — the classic "installed PWA stuck in an
 * auth loop". This matcher covers both the current hand-rolled endpoints
 * (`/api/v1/auth/*`) and the paths the forward-auth sidecar
 * (`homectl-auth-proxy`) will own after migration (`/auth/callback`,
 * `/auth/logout`, …), so the service worker is already safe when the sidecar
 * arrives.
 *
 * Kept dependency-free so it can be imported from both the service worker
 * bundle (`sw.ts`) and window code.
 */
export function isAuthPath(pathname: string): boolean {
  return pathname.startsWith('/api/v1/auth/') || pathname.startsWith('/auth/');
}
