/**
 * Decides which responses the service worker's runtime caches may store.
 *
 * Workbox's default is to cache status 0 (opaque) and 200 responses. Behind an
 * auth proxy that is dangerous: a request made with an expired session can be
 * 302-redirected to the identity provider's login page, and the *followed*
 * response — an HTML login page, or an opaque cross-origin body — comes back
 * with status 200/0. Caching it poisons the runtime cache: the app then serves
 * a login page where it expects trips JSON or image bytes, including offline,
 * where the user has no way to recover. These guards only admit responses that
 * demonstrably came straight from our API:
 *
 * - status must be exactly 200 (never opaque, never 3xx/4xx),
 * - the response must not be the result of a followed redirect,
 * - the body must not be HTML (our API serves JSON and media bytes, never HTML).
 *
 * Pure functions (no Workbox imports) so they are unit-testable outside a
 * service-worker context; `sw.ts` adapts them into `cacheWillUpdate` plugins.
 */

function isHtml(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.toLowerCase().includes('text/html');
}

/** Returns the response if it is safe to cache, or null to skip caching. */
export function cacheableApiResponse(response: Response): Response | null {
  if (response.status !== 200) return null;
  if (response.redirected) return null;
  if (isHtml(response)) return null;
  return response;
}
