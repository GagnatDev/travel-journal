import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginInteractiveLogin,
  markAuthenticated,
  resetLoginRedirectGuard,
  simulatePageLoadForTests,
} from '../auth/loginRedirect.js';

describe('beginInteractiveLogin', () => {
  beforeEach(() => {
    resetLoginRedirectGuard();
  });

  afterEach(() => {
    resetLoginRedirectGuard();
    vi.restoreAllMocks();
  });

  it('resolves to the in-app login route when no login URL is configured', () => {
    const navigate = vi.fn();
    expect(beginInteractiveLogin('/trips', { navigate })).toBe('client-route');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('performs a full-page redirect with the return path when a login URL is configured', () => {
    const navigate = vi.fn();
    const result = beginInteractiveLogin('/trips/42/timeline?tab=map', {
      loginUrl: '/auth/login',
      navigate,
    });
    expect(result).toBe('redirected');
    expect(navigate).toHaveBeenCalledWith(
      '/auth/login?rd=%2Ftrips%2F42%2Ftimeline%3Ftab%3Dmap',
    );
  });

  it('appends with & when the login URL already has a query string', () => {
    const navigate = vi.fn();
    beginInteractiveLogin('/trips', { loginUrl: '/auth/login?source=pwa', navigate });
    expect(navigate).toHaveBeenCalledWith('/auth/login?source=pwa&rd=%2Ftrips');
  });

  it('collapses a concurrent burst of expiries into a single navigation', () => {
    // A screen loading several media files behind an expired session fails all
    // at once: one session-expired event per request, in the same page
    // instance. Only the first may navigate — and the burst must consume only
    // ONE slot of the redirect budget.
    const navigate = vi.fn();
    const opts = { loginUrl: '/auth/login', navigate, now: 1_000_000 };
    expect(beginInteractiveLogin('/trips', opts)).toBe('redirected');
    expect(beginInteractiveLogin('/trips', opts)).toBe('redirected');
    expect(beginInteractiveLogin('/trips', opts)).toBe('redirected');
    expect(beginInteractiveLogin('/trips', opts)).toBe('redirected');
    expect(navigate).toHaveBeenCalledTimes(1);

    // The next page load still has 2 of 3 attempts left despite the 4-call burst.
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_001_000 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_002_000 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_003_000 })).toBe('suppressed');
  });

  it('suppresses redirects once the loop guard trips within the window', () => {
    // Each attempt in a real redirect loop comes with a fresh page load; the
    // sessionStorage log is what persists across them.
    const navigate = vi.fn();
    const opts = { loginUrl: '/auth/login', navigate, now: 1_000_000 };
    expect(beginInteractiveLogin('/trips', opts)).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_001_000 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_002_000 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_003_000 })).toBe('suppressed');
    expect(navigate).toHaveBeenCalledTimes(3);
  });

  it('allows redirecting again after the loop window has passed', () => {
    const navigate = vi.fn();
    const opts = { loginUrl: '/auth/login', navigate };
    expect(beginInteractiveLogin('/trips', { ...opts, now: 0 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 2 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 3 })).toBe('suppressed');
    // 61s later the earlier redirects have aged out of the window.
    expect(beginInteractiveLogin('/trips', { ...opts, now: 61_000 })).toBe('redirected');
  });

  it('resets the redirect budget when a session is confirmed', () => {
    // Redirect → successful login → much later the session expires again: the
    // new expiry must get a full set of attempts, not the previous leftovers.
    const navigate = vi.fn();
    const opts = { loginUrl: '/auth/login', navigate };
    expect(beginInteractiveLogin('/trips', { ...opts, now: 0 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1 })).toBe('redirected');
    simulatePageLoadForTests();
    expect(beginInteractiveLogin('/trips', { ...opts, now: 2 })).toBe('redirected');
    simulatePageLoadForTests();

    markAuthenticated();

    expect(beginInteractiveLogin('/trips', { ...opts, now: 3 })).toBe('redirected');
    expect(navigate).toHaveBeenCalledTimes(4);
  });
});
