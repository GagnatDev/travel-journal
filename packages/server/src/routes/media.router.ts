import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import type { AccessTokenPayload } from '@travel-journal/shared';

import { requireAuth } from '../middleware/auth.middleware.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { getTripById } from '../services/trip.service.js';
import { assertMediaAccess, streamMediaObject, uploadMedia } from '../services/media.service.js';

export const mediaRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /upload — Upload a media file
mediaRouter.post(
  '/upload',
  requireAuth,
  createRateLimit(30),
  upload.single('file'),
  // Multer error handler (must have 4 params)
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
      const { tripId, width, height } = req.body as { tripId: string; width: string; height: string };

      if (!tripId || typeof tripId !== 'string') {
        res.status(400).json({ error: { message: 'tripId is required', code: 'VALIDATION_ERROR' } });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: { message: 'file is required', code: 'VALIDATION_ERROR' } });
        return;
      }

      // Verify trip membership
      const trip = await getTripById(tripId);
      if (!trip) {
        res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
        return;
      }

      const isMember = trip.members.some((m) => m.userId === auth.userId);
      if (!isMember) {
        res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
        return;
      }

      const parsedWidth = parseInt(String(width), 10) || 0;
      const parsedHeight = parseInt(String(height), 10) || 0;

      const result = await uploadMedia(
        req.file.buffer,
        req.file.mimetype,
        tripId,
        parsedWidth,
        parsedHeight,
      );

      res.status(201).json({ key: result.key, url: `/api/v1/media/${result.key}` });
    } catch (err) {
      next(err);
    }
  },
);

// GET * — Stream media from object storage (same-origin for the SPA; avoids bucket CORS on fetch)
mediaRouter.get('/*', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const key = req.path.slice(1); // remove leading /

    if (!key) {
      res.status(400).json({ error: { message: 'key is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    await assertMediaAccess(key, auth.userId);
    await streamMediaObject(key, res);
  } catch (err) {
    if (!res.headersSent) {
      next(err);
      return;
    }
    res.destroy(err instanceof Error ? err : undefined);
  }
});
