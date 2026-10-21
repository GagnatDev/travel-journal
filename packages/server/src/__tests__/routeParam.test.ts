import { describe, expect, it } from 'vitest';

import { routeParam } from '../http/routeParam.js';

describe('routeParam', () => {
  it('returns a string path segment', () => {
    expect(routeParam('abc123')).toBe('abc123');
  });

  it('uses the first value when Express supplies a string array', () => {
    expect(routeParam(['abc123'])).toBe('abc123');
  });

  it.each([undefined, '', []])('rejects missing values: %j', (value) => {
    try {
      routeParam(value as string | string[] | undefined);
      expect.unreachable();
    } catch (err) {
      const error = err as Error & { status?: number; code?: string };
      expect(error.status).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    }
  });
});
