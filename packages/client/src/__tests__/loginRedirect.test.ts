import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginInteractiveLogin, resetLoginRedirectGuard } from '../auth/loginRedirect.js';

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

  it('suppresses redirects once the loop guard trips within the window', () => {
    const navigate = vi.fn();
    const opts = { loginUrl: '/auth/login', navigate, now: 1_000_000 };
    expect(beginInteractiveLogin('/trips', opts)).toBe('redirected');
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_001_000 })).toBe('redirected');
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_002_000 })).toBe('redirected');
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1_003_000 })).toBe('suppressed');
    expect(navigate).toHaveBeenCalledTimes(3);
  });

  it('allows redirecting again after the loop window has passed', () => {
    const navigate = vi.fn();
    const opts = { loginUrl: '/auth/login', navigate };
    expect(beginInteractiveLogin('/trips', { ...opts, now: 0 })).toBe('redirected');
    expect(beginInteractiveLogin('/trips', { ...opts, now: 1 })).toBe('redirected');
    expect(beginInteractiveLogin('/trips', { ...opts, now: 2 })).toBe('redirected');
    expect(beginInteractiveLogin('/trips', { ...opts, now: 3 })).toBe('suppressed');
    // 61s later the earlier redirects have aged out of the window.
    expect(beginInteractiveLogin('/trips', { ...opts, now: 61_000 })).toBe('redirected');
  });
});
