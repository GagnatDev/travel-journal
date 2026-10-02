import { attemptRefresh } from './tokenStore.js';

/**
 * Raised when a `fetch` call rejects — i.e. the request never reached the
 * server or no response came back (offline, DNS failure, dropped connection,
 * TLS error, timeout). This is deliberately distinct from an HTTP error
 * response (e.g. 401): a `NetworkError` means "we could not talk to the
 * server", NOT "the server rejected us". Auth handling keys off this so a
 * flaky connection never gets mistaken for an expired session.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    if (cause !== undefined) this.cause = cause;
  }
}

/** `fetch`, but a connectivity failure surfaces as a typed {@link NetworkError}. */
async function fetchOrThrow(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch (err) {
    throw new NetworkError(err);
  }
}

/**
 * Decide how to react when a token refresh (triggered by a 401) fails.
 *
 * A genuine auth failure means the refresh token is gone/expired, so the
 * session is truly over → notify the app to log out. A {@link NetworkError}
 * means we simply could not reach the server: the session may well still be
 * valid, so we must NOT log the user out — the caller can surface the error
 * and/or queue the work offline instead.
 */
function notifyIfSessionExpired(err: unknown): void {
  if (!(err instanceof NetworkError)) {
    window.dispatchEvent(new CustomEvent('auth:session-expired'));
  }
}

/**
 * An API call was answered with a redirect. Our own JSON API never redirects,
 * so this can only be an auth layer (e.g. the homectl-auth forward-auth
 * sidecar) sending the request to interactive login. Requests are made with
 * `redirect: 'manual'`, which surfaces as an `opaqueredirect` response in
 * browsers (status 0) or as the raw 3xx in other fetch implementations.
 *
 * Without `redirect: 'manual'`, `fetch` would follow the redirect cross-origin
 * to the identity provider and fail CORS — indistinguishable from being
 * offline. The app would then classify an expired session as a
 * {@link NetworkError}, keep the user in the cached "offline" experience
 * forever, and the installed PWA would be stuck with no path back to login.
 */
function isAuthRedirect(res: Response): boolean {
  return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
}

/** Signal session expiry for a redirected API call and build the error to surface. */
function sessionRedirectError(fallbackErrorMessage?: string): Error {
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
  return new Error(fallbackErrorMessage ?? 'Session expired');
}

/** Like {@link sessionRedirectError} for callers that swallow errors instead of throwing. */
function notifySessionRedirect(): void {
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}

export type ApiJsonOptions = {
  token?: string;
  method?: string;
  body?: unknown;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Used when the response is not OK and the body has no `error.message`. */
  fallbackErrorMessage?: string;
};

/** Extract `error.message` from a typical API JSON error body. */
export function parseApiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const err = (body as { error?: { message?: unknown } }).error;
  if (err && typeof err.message === 'string' && err.message.length > 0) {
    return err.message;
  }
  return undefined;
}

function mergeHeaders(
  token: string | undefined,
  body: unknown,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(extra);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/**
 * JSON API helper: Bearer token (optional), JSON body, unified error parsing, 204 → undefined.
 */
function buildRequestInit(options: ApiJsonOptions): RequestInit {
  const { token, method = 'GET', body, credentials, headers, signal } = options;
  const init: RequestInit = {
    method,
    headers: mergeHeaders(token, body, headers),
    // Never follow redirects: the JSON API doesn't issue them, and following
    // an auth proxy's login redirect cross-origin fails CORS and masquerades
    // as a connectivity error (see isAuthRedirect).
    redirect: 'manual',
  };
  if (credentials !== undefined) init.credentials = credentials;
  if (signal !== undefined) init.signal = signal;
  const serialized = serializeBody(body);
  if (serialized !== undefined) init.body = serialized;
  return init;
}

export async function apiJson<T>(path: string, options: ApiJsonOptions = {}): Promise<T> {
  const { fallbackErrorMessage } = options;
  const res = await fetchOrThrow(path, buildRequestInit(options));

  if (isAuthRedirect(res)) throw sessionRedirectError(fallbackErrorMessage);

  if (res.status === 401 && options.token) {
    let newToken: string;
    try {
      newToken = await attemptRefresh();
    } catch (err) {
      notifyIfSessionExpired(err);
      if (err instanceof NetworkError) throw err;
      throw new Error(fallbackErrorMessage ?? 'Session expired');
    }
    const retryRes = await fetchOrThrow(path, buildRequestInit({ ...options, token: newToken }));
    if (isAuthRedirect(retryRes)) throw sessionRedirectError(fallbackErrorMessage);
    if (!retryRes.ok) {
      if (retryRes.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:session-expired'));
      }
      const parsed = await retryRes.json().catch(() => ({}));
      throw new Error(parseApiErrorMessage(parsed) ?? fallbackErrorMessage ?? 'Request failed');
    }
    if (retryRes.status === 204) return undefined as T;
    return retryRes.json() as Promise<T>;
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(
      parseApiErrorMessage(parsed) ?? fallbackErrorMessage ?? 'Request failed',
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type ApiJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string | undefined; message: string | undefined };

/**
 * Same request shape as {@link apiJson}, but instead of throwing on `!res.ok`,
 * resolves to a result carrying the response's `error.code` so callers can
 * branch on specific failure reasons (e.g. an already-used token vs. an
 * expired one).
 */
export async function apiJsonWithError<T>(
  path: string,
  options: ApiJsonOptions = {},
): Promise<ApiJsonResult<T>> {
  const res = await fetchOrThrow(path, buildRequestInit(options));

  if (isAuthRedirect(res)) {
    notifySessionRedirect();
    return { ok: false, code: 'SESSION_EXPIRED', message: options.fallbackErrorMessage };
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    const code = (parsed as { error?: { code?: string } }).error?.code;
    return { ok: false, code, message: parseApiErrorMessage(parsed) };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await res.json()) as T };
}

/**
 * Same request shape as {@link apiJson}, but returns `undefined` when `!res.ok` instead of throwing.
 */
export async function apiJsonIfOk<T>(path: string, options: ApiJsonOptions = {}): Promise<T | undefined> {
  const res = await fetchOrThrow(path, buildRequestInit(options));

  if (isAuthRedirect(res)) {
    notifySessionRedirect();
    return undefined;
  }

  if (res.status === 401 && options.token) {
    let newToken: string;
    try {
      newToken = await attemptRefresh();
    } catch (err) {
      notifyIfSessionExpired(err);
      return undefined;
    }
    const retryRes = await fetchOrThrow(path, buildRequestInit({ ...options, token: newToken }));
    if (isAuthRedirect(retryRes)) {
      notifySessionRedirect();
      return undefined;
    }
    if (!retryRes.ok) {
      if (retryRes.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:session-expired'));
      }
      return undefined;
    }
    if (retryRes.status === 204) return undefined;
    return retryRes.json() as Promise<T>;
  }

  if (!res.ok) return undefined;
  if (res.status === 204) return undefined;
  return res.json() as Promise<T>;
}

/**
 * Authenticated GET returning raw bytes (e.g. PDF). Same 401 refresh behaviour as {@link apiJson}.
 */
export async function apiBlob(path: string, options: ApiJsonOptions = {}): Promise<Blob> {
  const { fallbackErrorMessage } = options;
  const res = await fetchOrThrow(path, buildRequestInit(options));

  if (isAuthRedirect(res)) throw sessionRedirectError(fallbackErrorMessage);

  if (res.status === 401 && options.token) {
    let newToken: string;
    try {
      newToken = await attemptRefresh();
    } catch (err) {
      notifyIfSessionExpired(err);
      if (err instanceof NetworkError) throw err;
      throw new Error(fallbackErrorMessage ?? 'Session expired');
    }
    const retryRes = await fetchOrThrow(path, buildRequestInit({ ...options, token: newToken }));
    if (isAuthRedirect(retryRes)) throw sessionRedirectError(fallbackErrorMessage);
    if (!retryRes.ok) {
      if (retryRes.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:session-expired'));
      }
      const parsed = await retryRes.json().catch(() => ({}));
      throw new Error(parseApiErrorMessage(parsed) ?? fallbackErrorMessage ?? 'Request failed');
    }
    return retryRes.blob();
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new Error(
      parseApiErrorMessage(parsed) ?? fallbackErrorMessage ?? 'Request failed',
    );
  }

  return res.blob();
}
