import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll } from 'vitest';

import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from '../services/auth.service.js';

beforeAll(() => {
  process.env['JWT_SECRET'] = 'test-secret';
});

describe('hashPassword / verifyPassword', () => {
  it('produces a bcrypt hash that verifies correctly', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(await verifyPassword('mypassword', hash)).toBe(true);
  });

  it('returns false for incorrect password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('generateAccessToken / verifyAccessToken', () => {
  const payload = { userId: 'user123', email: 'test@example.com', appRole: 'creator' as const };

  it('round-trips the payload', () => {
    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.appRole).toBe(payload.appRole);
  });

  it('throws for an expired token', () => {
    const expired = jwt.sign(payload, 'test-secret', { expiresIn: -1 });
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it('throws for a token signed with the wrong secret', () => {
    const badToken = jwt.sign(payload, 'wrong-secret');

    expect(() => verifyAccessToken(badToken)).toThrow();
  });

  it('rejects tokens signed with an algorithm other than HS256', () => {
    const token = jwt.sign(payload, 'test-secret', { algorithm: 'HS512' });

    expect(() => verifyAccessToken(token)).toThrow();
  });
});

describe('generateRefreshToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different tokens on each call', () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).not.toBe(t2);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('produces a 64-character hex string', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
