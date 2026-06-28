import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import type { AccessTokenPayload } from '@travel-journal/shared';

import { requireAppRole, requireAuth } from '../middleware/auth.middleware.js';
import { User } from '../models/User.model.js';
import { createAdminPasswordResetLink } from '../services/adminPasswordReset.service.js';
import { uploadAvatar, deleteObject } from '../services/media.service.js';

export const userRouter: Router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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
  avatarKey?: string;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    appRole: user.appRole,
    preferredLocale: user.preferredLocale,
    ...(user.avatarKey ? { avatarKey: user.avatarKey } : {}),
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

// POST /me/avatar — Upload profile picture
userRouter.post(
  '/me/avatar',
  requireAuth,
  avatarUpload.single('file'),
  (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { message: 'File too large', code: 'FILE_TOO_LARGE' } });
      return;
    }
    next(err);
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;

      if (!req.file) {
        res.status(400).json({ error: { message: 'file is required', code: 'VALIDATION_ERROR' } });
        return;
      }

      const user = await User.findById(auth.userId);
      if (!user) {
        res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
        return;
      }

      // Remove old avatar if present
      if (user.avatarKey) {
        void deleteObject(user.avatarKey);
      }

      const key = await uploadAvatar(req.file.buffer, req.file.mimetype, auth.userId);
      user.avatarKey = key;
      await user.save();

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /me/avatar — Remove profile picture
userRouter.delete(
  '/me/avatar',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const user = await User.findById(auth.userId);
      if (!user) {
        res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
        return;
      }

      if (user.avatarKey) {
        void deleteObject(user.avatarKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (user as any).avatarKey = undefined;
        await user.save();
      }

      res.json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  },
);

// GET /me — Get own public profile
userRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const user = await User.findById(auth.userId).lean();
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

// GET /:id — Get any user's public profile (any authenticated user)
userRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params['id']!;
      const user = await User.findById(userId).lean();
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
