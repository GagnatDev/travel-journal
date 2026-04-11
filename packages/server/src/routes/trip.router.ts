import { Router, Request, Response, NextFunction } from 'express';
import type { CreateTripRequest, UpdateTripRequest, TripStatus, AccessTokenPayload, Trip } from '@travel-journal/shared';

import { requireAuth, requireAppRole } from '../middleware/auth.middleware.js';
import {
  createTrip,
  getTripById,
  listTripsForUser,
  updateTrip,
  updateTripStatus,
  deleteTrip,
} from '../services/trip.service.js';

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

    res.locals['trip'] = trip;
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
