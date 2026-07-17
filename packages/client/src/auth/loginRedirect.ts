/**
 * Single escalation point for "the session is gone, the user must log in
 * interactively again".
 *
 * Why this needs care in an installed PWA: the app shell (index.html + JS) is
 * served cache-first by the service worker, so a client-side route change or a
 * plain reload never reaches the server. Once auth moves behind the
 * homectl-auth forward-auth sidecar, interactive login only happens when a
 * top-level navigation actually hits the sidecar. Recovery from an expired
 * session must therefore be a *full-page* navigation to a sidecar-owned path
 * (`/auth/login`) — a path the service worker deliberately never intercepts
 * (see `authPaths.ts`). Anything else leaves the PWA looping: cached shell →
 * 401s → reload → cached shell → 401s …
 *
 * And because that full-page redirect can itself loop (e.g. the sidecar keeps
 * redirecting back with a session cookie the webview refuses to store — a
 * known iOS-PWA failure mode), redirects are rate-limited via sessionStorage.
 * When the guard trips we stop redirecting and let the caller render a login
 * screen / error state instead of bouncing the user between origins forever.
 *
 * A burst of parallel API calls (a screen loading several images, say) all
 * fails at once when the session is gone, dispatching one `session-expired`
 * event per request. Only the FIRST escalation in a page instance navigates;
 * the rest piggyback on it — otherwise a single burst would spend the whole
 * redirect budget and trip the loop guard on what is really one attempt
 * (unforked auth-sidecar-migration.md, "coordinate concurrent 401s").
 *
 * Today (hand-rolled auth, no sidecar) `VITE_AUTH_LOGIN_URL` is unset and this
 * module resolves to `'client-route'`: the caller navigates to the in-app
 * `/login` screen exactly as before. At sidecar cutover, set
 * `VITE_AUTH_LOGIN_URL=/auth/login` and the escalation becomes the full-page
 * redirect described above — no other code change needed.
 */

const REDIRECT_LOG_KEY = 'auth:loginRedirectLog';

/** More than this many full-page login redirects within the window = loop. */
const MAX_REDIRECTS_PER_WINDOW = 3;
const LOOP_WINDOW_MS = 60_000;

export type LoginEscalation =
  /** Full-page navigation to the interactive login URL was started. */
  | 'redirected'
  /** No login URL configured — caller should route to the in-app login screen. */
  | 'client-route'
  /** Redirect-loop guard tripped — caller must render a recoverable state, not redirect. */
  | 'suppressed';

export interface BeginInteractiveLoginOptions {
  /** Override for tests; defaults to `VITE_AUTH_LOGIN_URL`. */
  loginUrl?: string;
  /** Override for tests; defaults to `Date.now()`. */
  now?: number;
  /** Override for tests; defaults to `window.location.assign`. */
  navigate?: (url: string) => void;
}

function configuredLoginUrl(): string | undefined {
  const url = import.meta.env.VITE_AUTH_LOGIN_URL;
  return url && url.trim() !== '' ? url.trim() : undefined;
}

function readRedirectLog(): number[] {
  try {
    const raw = sessionStorage.getItem(REDIRECT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === 'number') : [];
  } catch {
    return [];
  }
}

function writeRedirectLog(timestamps: number[]): void {
  try {
    sessionStorage.setItem(REDIRECT_LOG_KEY, JSON.stringify(timestamps));
  } catch {
    // sessionStorage unavailable — guard degrades to allowing the redirect.
  }
}

/**
 * True once a full-page login navigation has been started by this page
 * instance. `location.assign` does not stop script execution, so the other
 * requests of a failing burst still dispatch their events while the browser
 * is tearing the page down; they must not navigate (or consume redirect
 * budget) again. A real new attempt always comes with a fresh page load,
 * which resets this flag while the sessionStorage log persists.
 */
let redirectInFlight = false;

/** Exposed for tests. */
export function resetLoginRedirectGuard(): void {
  redirectInFlight = false;
  try {
    sessionStorage.removeItem(REDIRECT_LOG_KEY);
  } catch {
    // ignore
  }
}

/** Test-only: clear the in-page flag the way a fresh page load would. */
export function simulatePageLoadForTests(): void {
  redirectInFlight = false;
}

/**
 * Call whenever a session is confirmed working (successful login/refresh).
 * Clears the redirect budget so a later, unrelated expiry gets a full set of
 * attempts instead of inheriting leftovers from the previous recovery
 * (unforked auth-sidecar-migration.md, "reset the budget after a confirmed auth").
 */
export function markAuthenticated(): void {
  redirectInFlight = false;
  try {
    sessionStorage.removeItem(REDIRECT_LOG_KEY);
  } catch {
    // ignore
  }
}

/**
 * Escalate an expired session to interactive login. Returns what happened so
 * the caller can fall back to the in-app login screen when no full-page
 * redirect was started.
 */
export function beginInteractiveLogin(
  returnTo: string,
  options: BeginInteractiveLoginOptions = {},
): LoginEscalation {
  const loginUrl = options.loginUrl ?? configuredLoginUrl();
  if (!loginUrl) return 'client-route';

  // Collapse a concurrent burst into the navigation already under way.
  if (redirectInFlight) return 'redirected';

  const now = options.now ?? Date.now();
  const recent = readRedirectLog().filter((t) => now - t < LOOP_WINDOW_MS);
  if (recent.length >= MAX_REDIRECTS_PER_WINDOW) return 'suppressed';
  writeRedirectLog([...recent, now]);
  redirectInFlight = true;

  const separator = loginUrl.includes('?') ? '&' : '?';
  const target = `${loginUrl}${separator}rd=${encodeURIComponent(returnTo)}`;
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  navigate(target);
  return 'redirected';
}
