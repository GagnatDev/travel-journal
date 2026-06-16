import { NextFunction, Request, Response, Router } from 'express';
import type { AccessTokenPayload, ShippingAddress } from '@travel-journal/shared';

import { requireAppRole, requireAuth } from '../middleware/auth.middleware.js';
import { User } from '../models/User.model.js';
import { createAdminPasswordResetLink } from '../services/adminPasswordReset.service.js';
import { sanitizeShippingAddress } from '../services/photobook-order.service.js';

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
  photobookOrderingEnabled?: boolean;
  shippingAddress?: ShippingAddress;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    appRole: user.appRole,
    preferredLocale: user.preferredLocale,
    photobookOrderingEnabled: user.photobookOrderingEnabled ?? false,
    ...(user.shippingAddress && { shippingAddress: user.shippingAddress }),
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
      const { preferredLocale, displayName, shippingAddress } = req.body as {
        preferredLocale?: string;
        displayName?: string;
        shippingAddress?: unknown;
      };

      const update: Record<string, unknown> = {};

      if (shippingAddress !== undefined) {
        if (shippingAddress === null) {
          update['shippingAddress'] = undefined;
        } else {
          const sanitized = sanitizeShippingAddress(shippingAddress);
          if (!sanitized) {
            res.status(400).json({
              error: { message: 'Invalid shipping address', code: 'VALIDATION_ERROR' },
            });
            return;
          }
          update['shippingAddress'] = sanitized;
        }
      }

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

// PATCH /:id/photobook-ordering — Enable/disable a user's ability to order a physical photobook (admin only)
userRouter.patch(
  '/:id/photobook-ordering',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params['id']!;
      const { enabled } = req.body as { enabled?: unknown };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: { message: 'enabled must be a boolean', code: 'VALIDATION_ERROR' },
        });
        return;
      }
      const user = await User.findByIdAndUpdate(
        userId,
        { photobookOrderingEnabled: enabled },
        { new: true },
      );
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

// POST /:id/password-reset-link — Mint single-use reset link (admin only)
userRouter.post(
  '/:id/password-reset-link',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const userId = req.params['id']!;
      const { resetLink } = await createAdminPasswordResetLink(userId, auth.userId);
      res.status(201).json({ resetLink });
    } catch (err) {
      next(err);
    }
  },
);
