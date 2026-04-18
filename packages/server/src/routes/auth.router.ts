import { Router, Request, Response } from 'express';
import type { LoginRequest, LoginResponse, PublicUser, RegisterRequest } from '@travel-journal/shared';

import { createRateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { Session } from '../models/Session.model.js';
import { User } from '../models/User.model.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../services/auth.service.js';

export const authRouter: Router = Router();

const authRateLimit = createRateLimit(10);
const authSessionRateLimit = createRateLimit(10);

const COOKIE_NAME = 'refreshToken';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

function toPublicUser(user: { _id: unknown; email: string; displayName: string; appRole: string; preferredLocale: string }): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    appRole: user.appRole as PublicUser['appRole'],
    preferredLocale: user.preferredLocale as PublicUser['preferredLocale'],
  };
}

async function issueTokens(userId: string, res: Response) {
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await Session.create({ tokenHash, userId, expiresAt });

  res.cookie(COOKIE_NAME, rawRefreshToken, cookieOptions());

  return rawRefreshToken;
}

// GET /api/v1/auth/register — check if admin exists
authRouter.get('/register', async (_req: Request, res: Response) => {
  const count = await User.countDocuments();
  res.json({ adminExists: count > 0 });
});

// POST /api/v1/auth/register — admin bootstrap
authRouter.post('/register', authRateLimit, async (req: Request, res: Response) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }

    const adminEmail = process.env['ADMIN_EMAIL'];
    const body = req.body as RegisterRequest;

    if (!adminEmail || body.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }

    if (!body.displayName || !body.password) {
      res.status(400).json({ error: { message: 'displayName and password are required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    const user = await User.create({
      email: body.email.toLowerCase(),
      passwordHash,
      displayName: body.displayName,
      appRole: 'admin',
    });

    const userId = String(user._id);
    await issueTokens(userId, res);

    const accessToken = generateAccessToken({
      userId,
      email: user.email,
      appRole: user.appRole,
    });

    const response: LoginResponse = { accessToken, user: toPublicUser(user) };
    res.status(201).json(response);
  } catch {
    res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
});

// POST /api/v1/auth/login
authRouter.post('/login', authRateLimit, async (req: Request, res: Response) => {
  const body = req.body as LoginRequest;

  const user = await User.findOne({ email: body.email?.toLowerCase() });
  if (!user) {
    res.status(401).json({ error: { message: 'Invalid credentials', code: 'UNAUTHORIZED' } });
    return;
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: { message: 'Invalid credentials', code: 'UNAUTHORIZED' } });
    return;
  }

  const userId = String(user._id);
  await issueTokens(userId, res);

  const accessToken = generateAccessToken({
    userId,
    email: user.email,
    appRole: user.appRole,
  });

  const response: LoginResponse = { accessToken, user: toPublicUser(user) };
  res.json(response);
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', authSessionRateLimit, async (req: Request, res: Response) => {
  const rawToken = req.cookies[COOKIE_NAME] as string | undefined;

  if (!rawToken) {
    res.status(401).json({ error: { message: 'No refresh token', code: 'UNAUTHORIZED' } });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const session = await Session.findOne({ tokenHash });

  if (!session || session.expiresAt < new Date()) {
    res.clearCookie(COOKIE_NAME);
    res.status(401).json({ error: { message: 'Invalid or expired session', code: 'UNAUTHORIZED' } });
    return;
  }

  const user = await User.findById(session.userId);
  if (!user) {
    res.clearCookie(COOKIE_NAME);
    res.status(401).json({ error: { message: 'User not found', code: 'UNAUTHORIZED' } });
    return;
  }

  // Rotate refresh token
  const newRawToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  session.tokenHash = newTokenHash;
  session.expiresAt = newExpiresAt;
  await session.save();

  res.cookie(COOKIE_NAME, newRawToken, cookieOptions());

  const userId = String(user._id);
  const accessToken = generateAccessToken({
    userId,
    email: user.email,
    appRole: user.appRole,
  });

  res.json({ accessToken, user: toPublicUser(user) });
});

// POST /api/v1/auth/logout — cookie-based; no Bearer required (client may only have refresh cookie)
authRouter.post('/logout', authSessionRateLimit, async (req: Request, res: Response) => {
  const rawToken = req.cookies[COOKIE_NAME] as string | undefined;

  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await Session.deleteOne({ tokenHash });
  }

  res.clearCookie(COOKIE_NAME);
  res.status(204).send();
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, async (_req: Request, res: Response) => {
  const auth = res.locals['auth'] as { userId: string };
  const user = await User.findById(auth.userId);

  if (!user) {
    res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
    return;
  }

  res.json(toPublicUser(user));
});
