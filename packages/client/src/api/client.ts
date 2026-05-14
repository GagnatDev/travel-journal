import { attemptRefresh } from './tokenStore.js';

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
  };
  if (credentials !== undefined) init.credentials = credentials;
  if (signal !== undefined) init.signal = signal;
  const serialized = serializeBody(body);
  if (serialized !== undefined) init.body = serialized;
  return init;
}

export async function apiJson<T>(path: string, options: ApiJsonOptions = {}): Promise<T> {
  const { fallbackErrorMessage } = options;
  const res = await fetch(path, buildRequestInit(options));

  if (res.status === 401 && options.token) {
    let newToken: string;
    try {
      newToken = await attemptRefresh();
    } catch {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      throw new Error(fallbackErrorMessage ?? 'Session expired');
    }
    const retryRes = await fetch(path, buildRequestInit({ ...options, token: newToken }));
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

/**
 * Same request shape as {@link apiJson}, but returns `undefined` when `!res.ok` instead of throwing.
 */
export async function apiJsonIfOk<T>(path: string, options: ApiJsonOptions = {}): Promise<T | undefined> {
  const res = await fetch(path, buildRequestInit(options));

  if (res.status === 401 && options.token) {
    let newToken: string;
    try {
      newToken = await attemptRefresh();
    } catch {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      return undefined;
    }
    const retryRes = await fetch(path, buildRequestInit({ ...options, token: newToken }));
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
  const res = await fetch(path, buildRequestInit(options));

  if (res.status === 401 && options.token) {
    let newToken: string;
    try {
      newToken = await attemptRefresh();
    } catch {
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      throw new Error(fallbackErrorMessage ?? 'Session expired');
    }
    const retryRes = await fetch(path, buildRequestInit({ ...options, token: newToken }));
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
