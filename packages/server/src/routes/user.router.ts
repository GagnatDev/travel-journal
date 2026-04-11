import { NextFunction, Request, Response, Router } from 'express';
import type { AccessTokenPayload } from '@travel-journal/shared';

import { requireAppRole, requireAuth } from '../middleware/auth.middleware.js';
import { User } from '../models/User.model.js';

export const userRouter: Router = Router();

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

function toPublicUser(user: {
  _id: unknown;
  email: string;
  displayName: string;
  appRole: string;
  preferredLocale: string;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    appRole: user.appRole,
    preferredLocale: user.preferredLocale,
    createdAt: user.createdAt?.toISOString(),
  };
}

// PATCH /me — Update own profile (must be before /:id to avoid shadowing)
userRouter.patch(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const { preferredLocale, displayName } = req.body as {
        preferredLocale?: string;
        displayName?: string;
      };

      const update: Record<string, unknown> = {};

      if (preferredLocale !== undefined) {
        if (!['nb', 'en'].includes(preferredLocale)) {
          res.status(400).json({
            error: { message: 'preferredLocale must be nb or en', code: 'VALIDATION_ERROR' },
          });
          return;
        }
        update['preferredLocale'] = preferredLocale;
      }

      if (displayName !== undefined) {
        if (typeof displayName !== 'string' || !displayName.trim()) {
          res.status(400).json({
            error: { message: 'displayName cannot be empty', code: 'VALIDATION_ERROR' },
          });
          return;
        }
        update['displayName'] = displayName.trim();
      }

      const user = await User.findByIdAndUpdate(auth.userId, update, { new: true });
      if (!user) {
        res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
        return;
      }

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  },
);

// GET / — List all users (admin only)
userRouter.get(
  '/',
  requireAppRole('admin'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      res.json(users.map(toPublicUser));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /:id/promote — Promote follower to creator (admin only)
userRouter.patch(
  '/:id/promote',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params['id']!;
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
        return;
      }

      if (user.appRole !== 'follower') {
        throw createHttpError('Only followers can be promoted to creator', 400, 'VALIDATION_ERROR');
      }

      user.appRole = 'creator';
      await user.save();

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  },
);
