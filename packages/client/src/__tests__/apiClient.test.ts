import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/tokenStore.js', () => ({
  attemptRefresh: vi.fn(),
  registerRefresh: vi.fn(),
}));

import { apiJson, parseApiErrorMessage } from '../api/client.js';
import { attemptRefresh } from '../api/tokenStore.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseApiErrorMessage', () => {
  it('returns nested error message when present', () => {
    expect(parseApiErrorMessage({ error: { message: 'Not allowed' } })).toBe('Not allowed');
  });

  it('returns undefined for missing or empty message', () => {
    expect(parseApiErrorMessage({})).toBeUndefined();
    expect(parseApiErrorMessage({ error: {} })).toBeUndefined();
    expect(parseApiErrorMessage({ error: { message: '' } })).toBeUndefined();
    expect(parseApiErrorMessage(null)).toBeUndefined();
  });
});

describe('apiJson', () => {
  it('throws with server message when response is not ok and body parses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: { message: 'Invalid email' } }),
      }),
    );

    await expect(apiJson('/api/v1/x', { token: 't' })).rejects.toThrow('Invalid email');
  });

  it('resolves undefined for 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('should not read body')),
      }),
    );

    await expect(apiJson<void>('/api/v1/x', { method: 'DELETE', token: 't' })).resolves.toBeUndefined();
  });

  it('retries with new token after 401 when token is present and refresh succeeds', async () => {
    vi.mocked(attemptRefresh).mockResolvedValue('new-token');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { message: 'Expired' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'ok' }),
        }),
    );

    const result = await apiJson<{ data: string }>('/api/v1/x', { token: 'old-token' });

    expect(result).toEqual({ data: 'ok' });
    expect(attemptRefresh).toHaveBeenCalledOnce();
    const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBe(2);
    const retryHeaders = fetchCalls[1]![1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
  });

  it('dispatches auth:session-expired and throws when 401 and refresh fails', async () => {
    vi.mocked(attemptRefresh).mockRejectedValue(new Error('Refresh failed'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      }),
    );

    const events: Event[] = [];
    window.addEventListener('auth:session-expired', (e) => events.push(e));

    await expect(apiJson('/api/v1/x', { token: 'old-token' })).rejects.toThrow();
    expect(events.length).toBe(1);

    window.removeEventListener('auth:session-expired', (e) => events.push(e));
  });

  it('does not attempt refresh on 401 when no token is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
      }),
    );

    await expect(apiJson('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).rejects.toThrow('Unauthorized');
    expect(attemptRefresh).not.toHaveBeenCalled();
  });
});
