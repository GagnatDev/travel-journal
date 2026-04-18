import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AccessTokenPayload } from '@travel-journal/shared';

const BCRYPT_COST = 12;
const ACCESS_TOKEN_TTL = '15m';

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL, algorithm: 'HS256' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  return decoded as AccessTokenPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
