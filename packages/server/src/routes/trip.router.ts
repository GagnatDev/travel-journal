import { Router, Request, Response, NextFunction } from 'express';
import {
  resolvePhotobookPdfLocaleKey,
  type AccessTokenPayload,
  type CreateTripRequest,
  type Trip,
  type TripStatus,
  type UpdateTripMemberNotificationPreferencesRequest,
  type UpdateTripRequest,
} from '@travel-journal/shared';
import mongoose from 'mongoose';

import { requireAppRole, requireAuth } from '../middleware/auth.middleware.js';
import { Trip as TripModel } from '../models/Trip.model.js';
import {
  assertTripCreator,
  createTrip,
  deleteTrip,
  getTripById,
  listTripsForUser,
  redactPhotobookPdfJobForNonCreator,
  updateTrip,
  updateTripStatus,
} from '../services/trip.service.js';
import { streamMediaObject } from '../services/media.service.js';
import { schedulePhotobookPdfJob } from '../services/trip-photobook-job.service.js';
import { entryRouter } from './entry.router.js';
import { memberRouter } from './member.router.js';

export const tripRouter: Router = Router();

// All routes require auth
tripRouter.use(requireAuth);

// Membership guard: verifies user is a member of the trip; attaches trip + tripRole to res.locals
async function membershipGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const tripId = req.params['id']!;

    const trip = await getTripById(tripId);
    if (!trip) {
      res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
      return;
    }

    const member = trip.members.find((m) => m.userId === auth.userId);
    if (!member) {
      // Do not leak existence — return 404
      res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
      return;
    }

    res.locals['trip'] = redactPhotobookPdfJobForNonCreator(trip, auth.userId);
    res.locals['tripRole'] = member.tripRole;
    next();
  } catch (err) {
    next(err);
  }
}

// POST / — Create trip (admin or creator only)
tripRouter.post(
  '/',
  requireAppRole('admin', 'creator'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const body = req.body as CreateTripRequest;

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        res.status(400).json({ error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
        return;
      }

      const trip = await createTrip(body, auth.userId);
      res.status(201).json(trip);
    } catch (err) {
      next(err);
    }
  },
);

// GET / — List trips for authenticated user
tripRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const trips = await listTripsForUser(auth.userId);
    res.json(trips);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/status — Status transition (must be before /:id to avoid conflict)
tripRouter.patch(
  '/:id/status',
  membershipGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const { status } = req.body as { status: TripStatus };
      const tripId = req.params['id']!;

      if (!status) {
        res.status(400).json({ error: { message: 'status is required', code: 'VALIDATION_ERROR' } });
        return;
      }

      const trip = await updateTripStatus(tripId, status, auth.userId);
      res.json(trip);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/photobook/generate — enqueue async PDF (trip creator only)
tripRouter.post(
  '/:id/photobook/generate',
  membershipGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const trip = res.locals['trip'] as Trip;
      const tripId = req.params['id']!;

      try {
        assertTripCreator(trip, auth.userId);
      } catch (err) {
        const status = (err as { status?: number }).status ?? 403;
        res.status(status).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
        return;
      }

      if (trip.status !== 'completed' && trip.status !== 'active') {
        res.status(400).json({
          error: {
            message: 'Photobook PDF is only available for active or completed trips',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const body = req.body as { locale?: string; timeZone?: string };
      const localeKey = resolvePhotobookPdfLocaleKey(
        typeof body.locale === 'string' && body.locale.trim()
          ? body.locale.trim()
          : process.env['TRIP_PDF_LOCALE'] ?? 'nb',
      );
      const timeZone =
        typeof body.timeZone === 'string' && body.timeZone.trim() ? body.timeZone.trim() : undefined;

      const filter: mongoose.FilterQuery<typeof TripModel> = {
        _id: new mongoose.Types.ObjectId(tripId),
        $or: [{ 'photobookPdfJob.status': { $ne: 'pending' } }, { photobookPdfJob: { $exists: false } }],
      };

      const updated = await TripModel.findOneAndUpdate(
        filter,
        {
          $set: {
            photobookPdfJob: {
              status: 'pending',
              localeKey,
              ...(timeZone !== undefined ? { timeZone } : {}),
            },
          },
        },
        { new: true },
      );

      if (!updated) {
        res.status(409).json({
          error: { message: 'Photobook PDF generation is already in progress', code: 'CONFLICT' },
        });
        return;
      }

      schedulePhotobookPdfJob(tripId);

      const nextTrip = await getTripById(tripId);
      if (!nextTrip) {
        res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
        return;
      }
      res.status(202).json(nextTrip);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/photobook.pdf — Download generated PDF from storage (trip creator only)
tripRouter.get(
  '/:id/photobook.pdf',
  membershipGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const trip = res.locals['trip'] as Trip;

      try {
        assertTripCreator(trip, auth.userId);
      } catch (err) {
        const status = (err as { status?: number }).status ?? 403;
        res.status(status).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
        return;
      }

      if (trip.status !== 'completed' && trip.status !== 'active') {
        res.status(400).json({
          error: {
            message: 'Photobook PDF is only available for active or completed trips',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const job = trip.photobookPdfJob;
      if (!job || job.status !== 'ready' || !job.pdfStorageKey) {
        res.status(409).json({
          error: {
            message: 'Photobook PDF is not ready yet. Generate it from trip settings first.',
            code: 'CONFLICT',
          },
        });
        return;
      }

      const safeName = trip.name.replace(/[^\w\s-]/g, '').trim().slice(0, 80) || 'trip';
      await streamMediaObject(job.pdfStorageKey, res, req.headers['if-none-match'], {
        attachmentFilename: `${safeName}-photobook.pdf`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id — Trip detail (member only)
tripRouter.get('/:id', membershipGuard, (_req: Request, res: Response): void => {
  res.json(res.locals['trip'] as Trip);
});

// PATCH /:id — Update trip metadata (trip creator only)
tripRouter.patch(
  '/:id',
  membershipGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const body = req.body as UpdateTripRequest;
      const tripId = req.params['id']!;

      const trip = await updateTrip(tripId, body, auth.userId);
      res.json(trip);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /:id/members/me/notification-preferences — Update own trip-level notification preferences
tripRouter.patch(
  '/:id/members/me/notification-preferences',
  membershipGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const tripId = req.params['id']!;
      const body = req.body as UpdateTripMemberNotificationPreferencesRequest;

      const validModes: UpdateTripMemberNotificationPreferencesRequest['newEntriesMode'][] = [
        'off',
        'per_entry',
        'daily_digest',
      ];
      if (!validModes.includes(body.newEntriesMode)) {
        res.status(400).json({
          error: {
            message: `newEntriesMode must be one of: ${validModes.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const result = await TripModel.updateOne(
        {
          _id: new mongoose.Types.ObjectId(tripId),
          'members.userId': new mongoose.Types.ObjectId(auth.userId),
        },
        {
          $set: {
            'members.$.notificationPreferences.newEntriesMode': body.newEntriesMode,
          },
          $unset: {
            'members.$.notificationPreferences.newEntriesPushEnabled': '',
          },
        },
      );

      if (!result.matchedCount) {
        res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
        return;
      }

      const trip = await getTripById(tripId);
      if (!trip) {
        res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
        return;
      }

      res.json(trip);
    } catch (err) {
      next(err);
    }
  },
);

// Mount member management sub-router
tripRouter.use('/:id/members', memberRouter);

// Mount entry sub-router
tripRouter.use('/:id/entries', entryRouter);

// DELETE /:id — Delete trip (creator only, with constraints; admin can delete any)
tripRouter.delete(
  '/:id',
  membershipGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const tripId = req.params['id']!;

      await deleteTrip(tripId, auth.userId, auth.appRole);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
