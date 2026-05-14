import { NextFunction, Request, Response, Router } from 'express';
import type { AccessTokenPayload, Trip } from '@travel-journal/shared';

import { requireAuth } from '../middleware/auth.middleware.js';
import { Trip as TripModel } from '../models/Trip.model.js';
import {
  addTripMember,
  listTripInvites,
  listTripMemberInviteSuggestions,
  revokeInvite,
} from '../services/invite.service.js';
import { getTripById } from '../services/trip.service.js';

export const memberRouter: Router = Router({ mergeParams: true });

// All member routes require auth
memberRouter.use(requireAuth);

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

/** Trip member who may use invite flows: creator, or contributor when `allowContributorInvites` is true. */
async function tripMemberInviteGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    if (member.tripRole === 'follower') {
      res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }
    if (member.tripRole === 'contributor' && !trip.allowContributorInvites) {
      res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }

    res.locals['trip'] = trip;
    next();
  } catch (err) {
    next(err);
  }
}

function creatorOnlyGuard(req: Request, res: Response, next: NextFunction): void {
  const auth = res.locals['auth'] as AccessTokenPayload;
  const trip = res.locals['trip'] as Trip;
  const member = trip.members.find((m) => m.userId === auth.userId);
  if (!member || member.tripRole !== 'creator') {
    res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    return;
  }
  next();
}

memberRouter.use(tripMemberInviteGuard);

// GET /invites/suggestions — People from related trips (before /invites/:id patterns)
memberRouter.get(
  '/invites/suggestions',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tripId = req.params['id']!;
      const auth = res.locals['auth'] as AccessTokenPayload;
      const suggestions = await listTripMemberInviteSuggestions(tripId, auth.userId);
      res.json(suggestions);
    } catch (err) {
      next(err);
    }
  },
);

// GET /invites — List pending trip invites (defined before /:userId to avoid conflicts)
memberRouter.get(
  '/invites',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tripId = req.params['id']!;
      const invites = await listTripInvites(tripId);
      res.json(invites);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /invites/:inviteId — Revoke trip invite
memberRouter.delete(
  '/invites/:inviteId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const inviteId = req.params['inviteId']!;
      await revokeInvite(inviteId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// POST / — Add member or generate trip invite
memberRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const tripId = req.params['id']!;
      const { emailOrNickname, tripRole } = req.body as {
        emailOrNickname?: string;
        tripRole?: 'contributor' | 'follower';
      };

      if (!emailOrNickname || typeof emailOrNickname !== 'string') {
        res.status(400).json({
          error: { message: 'emailOrNickname is required', code: 'VALIDATION_ERROR' },
        });
        return;
      }
      if (!tripRole || !['contributor', 'follower'].includes(tripRole)) {
        res.status(400).json({
          error: {
            message: 'tripRole must be contributor or follower',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const result = await addTripMember(tripId, emailOrNickname, tripRole, auth.userId);

      if (result.type === 'invite_created') {
        const inviteLink = `/invite/accept?token=${result.rawToken}`;
        res.json({ type: 'invite_created', inviteLink });
      } else {
        res.json({ type: 'added' });
      }
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /:userId/role — Change a member's trip role (creator only)
memberRouter.patch(
  '/:userId/role',
  creatorOnlyGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tripId = req.params['id']!;
      const userId = req.params['userId']!;
      const { tripRole } = req.body as { tripRole?: 'contributor' | 'follower' };

      if (!tripRole || !['contributor', 'follower'].includes(tripRole)) {
        res.status(400).json({
          error: {
            message: 'tripRole must be contributor or follower',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      const trip = await getTripById(tripId);
      if (!trip) {
        res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
        return;
      }

      const member = trip.members.find((m) => m.userId === userId);
      if (!member) {
        res.status(404).json({ error: { message: 'Member not found', code: 'NOT_FOUND' } });
        return;
      }

      if (member.tripRole === 'creator') {
        throw createHttpError("Cannot change the trip creator's role", 400, 'VALIDATION_ERROR');
      }

      await TripModel.updateOne(
        { _id: tripId, 'members.userId': userId },
        { $set: { 'members.$.tripRole': tripRole } },
      );

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /:userId — Remove a member (creator only)
memberRouter.delete(
  '/:userId',
  creatorOnlyGuard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tripId = req.params['id']!;
      const userId = req.params['userId']!;

      const trip = await getTripById(tripId);
      if (!trip) {
        res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
        return;
      }

      const member = trip.members.find((m) => m.userId === userId);
      if (!member) {
        res.status(404).json({ error: { message: 'Member not found', code: 'NOT_FOUND' } });
        return;
      }

      if (member.tripRole === 'creator') {
        throw createHttpError('Cannot remove the trip creator', 400, 'VALIDATION_ERROR');
      }

      await TripModel.updateOne({ _id: tripId }, { $pull: { members: { userId } } });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
