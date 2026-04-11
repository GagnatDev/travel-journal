import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiJson, parseApiErrorMessage } from '../api/client.js';

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
});
