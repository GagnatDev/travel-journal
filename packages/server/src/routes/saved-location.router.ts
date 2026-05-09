import { NextFunction, Request, Response, Router } from 'express';
import type { AccessTokenPayload, CreateSavedLocationRequest, TripRole } from '@travel-journal/shared';

import { requireAuth } from '../middleware/auth.middleware.js';
import { getTripById } from '../services/trip.service.js';
import {
  createSavedLocation,
  deleteSavedLocation,
  listSavedLocationsForTrip,
} from '../services/saved-location.service.js';

export const savedLocationRouter: Router = Router({ mergeParams: true });

savedLocationRouter.use(requireAuth);

async function savedLocationMembershipGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
      res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
      return;
    }

    res.locals['tripRole'] = member.tripRole;
    next();
  } catch (err) {
    next(err);
  }
}

savedLocationRouter.use(savedLocationMembershipGuard);

savedLocationRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripId = req.params['id']!;
    const list = await listSavedLocationsForTrip(tripId);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

savedLocationRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const tripRole = res.locals['tripRole'] as TripRole;
    const tripId = req.params['id']!;
    const body = req.body as CreateSavedLocationRequest;

    const location = await createSavedLocation(tripId, auth.userId, body, tripRole);
    res.status(201).json(location);
  } catch (err) {
    next(err);
  }
});

savedLocationRouter.delete(
  '/:savedId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tripRole = res.locals['tripRole'] as TripRole;
      const tripId = req.params['id']!;
      const savedId = req.params['savedId']!;

      await deleteSavedLocation(tripId, savedId, tripRole);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
