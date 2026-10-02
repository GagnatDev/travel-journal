import { describe, expect, it } from 'vitest';

import { isAuthPath } from '../auth/authPaths.js';
import { cacheableApiResponse } from '../pwa/swCachePolicy.js';

describe('isAuthPath', () => {
  it('matches the hand-rolled auth API endpoints', () => {
    expect(isAuthPath('/api/v1/auth/refresh')).toBe(true);
    expect(isAuthPath('/api/v1/auth/login')).toBe(true);
    expect(isAuthPath('/api/v1/auth/logout')).toBe(true);
  });

  it('matches the sidecar-owned auth paths', () => {
    expect(isAuthPath('/auth/callback')).toBe(true);
    expect(isAuthPath('/auth/login')).toBe(true);
    expect(isAuthPath('/auth/logout')).toBe(true);
  });

  it('does not match app or API routes', () => {
    expect(isAuthPath('/')).toBe(false);
    expect(isAuthPath('/trips')).toBe(false);
    expect(isAuthPath('/api/v1/trips')).toBe(false);
    expect(isAuthPath('/api/v1/media/abc')).toBe(false);
    // In-app screens are SPA routes, not auth-layer paths.
    expect(isAuthPath('/login')).toBe(false);
  });
});

function fakeResponse(overrides: {
  status?: number;
  redirected?: boolean;
  contentType?: string;
}): Response {
  return {
    status: overrides.status ?? 200,
    redirected: overrides.redirected ?? false,
    headers: new Headers(
      overrides.contentType !== undefined ? { 'content-type': overrides.contentType } : {},
    ),
  } as unknown as Response;
}

describe('cacheableApiResponse', () => {
  it('admits a clean same-origin 200', () => {
    const res = fakeResponse({ contentType: 'application/json' });
    expect(cacheableApiResponse(res)).toBe(res);
  });

  it('rejects opaque and error statuses', () => {
    expect(cacheableApiResponse(fakeResponse({ status: 0 }))).toBeNull();
    expect(cacheableApiResponse(fakeResponse({ status: 302 }))).toBeNull();
    expect(cacheableApiResponse(fakeResponse({ status: 401 }))).toBeNull();
    expect(cacheableApiResponse(fakeResponse({ status: 500 }))).toBeNull();
  });

  it('rejects responses that arrived via a followed redirect', () => {
    expect(
      cacheableApiResponse(fakeResponse({ redirected: true, contentType: 'application/json' })),
    ).toBeNull();
  });

  it('rejects HTML bodies (a login page is never valid API data)', () => {
    expect(
      cacheableApiResponse(fakeResponse({ contentType: 'text/html; charset=utf-8' })),
    ).toBeNull();
  });
});
