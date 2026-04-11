import { NextFunction, Request, Response, Router } from 'express';
import type { AccessTokenPayload } from '@travel-journal/shared';

import { requireAppRole } from '../middleware/auth.middleware.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { Session } from '../models/Session.model.js';
import { generateRefreshToken, hashToken } from '../services/auth.service.js';
import {
  acceptInvite,
  createPlatformInvite,
  listPlatformInvites,
  revokeInvite,
  validateInviteToken,
} from '../services/invite.service.js';

export const inviteRouter: Router = Router();

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

// POST /platform — Create platform invite (admin only)
inviteRouter.post(
  '/platform',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const { email, assignedAppRole } = req.body as {
        email?: string;
        assignedAppRole?: 'creator' | 'follower';
      };

      if (!email || typeof email !== 'string' || !email.trim()) {
        res
          .status(400)
          .json({ error: { message: 'email is required', code: 'VALIDATION_ERROR' } });
        return;
      }
      if (!assignedAppRole || !['creator', 'follower'].includes(assignedAppRole)) {
        res.status(400).json({
          error: {
            message: 'assignedAppRole must be creator or follower',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const { invite, rawToken } = await createPlatformInvite(
        email,
        assignedAppRole,
        auth.userId,
      );
      const inviteLink = `/invite/accept?token=${rawToken}`;
      res.status(201).json({ invite, inviteLink });
    } catch (err) {
      next(err);
    }
  },
);

// GET /platform — List platform invites (admin only)
inviteRouter.get(
  '/platform',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query['status'] as string | undefined;
      const invites = await listPlatformInvites(status);
      res.json(invites);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /platform/:id — Revoke platform invite (admin only)
inviteRouter.delete(
  '/platform/:id',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await revokeInvite(req.params['id']!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// GET /:token/validate — Validate token (public)
inviteRouter.get(
  '/:token/validate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.params['token']!;
      const invite = await validateInviteToken(token);
      res.json({
        email: invite.email,
        type: invite.type,
        assignedAppRole: invite.assignedAppRole,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /accept — Accept invite and create account (public, rate limited)
inviteRouter.post(
  '/accept',
  createRateLimit(10),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, displayName, password } = req.body as {
        token?: string;
        displayName?: string;
        password?: string;
      };

      if (!token || !displayName || !password) {
        res.status(400).json({
          error: {
            message: 'token, displayName, and password are required',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({
          error: {
            message: 'Password must be at least 8 characters',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const { user, accessToken, userId } = await acceptInvite(token, displayName, password);

      // Issue refresh token session
      const rawRefreshToken = generateRefreshToken();
      const tokenHash = hashToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
      await Session.create({ tokenHash, userId, expiresAt });

      res.cookie(COOKIE_NAME, rawRefreshToken, cookieOptions());
      res.status(201).json({ accessToken, user });
    } catch (err) {
      next(err);
    }
  },
);
