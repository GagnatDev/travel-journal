import { NextFunction, Request, Response, Router } from 'express';
import type {
  AccessTokenPayload,
  AddCommentRequest,
  CreateEntryRequest,
  ReactionEmoji,
  TripRole,
  UpdateEntryRequest,
} from '@travel-journal/shared';

import { requireAuth } from '../middleware/auth.middleware.js';
import { getTripById } from '../services/trip.service.js';
import {
  createEntry,
  getEntryById,
  listEntries,
  listEntryLocations,
  softDeleteEntry,
  tryParseClientCreatedAt,
  updateEntry,
} from '../services/entry.service.js';
import { toggleReaction } from '../services/reaction.service.js';
import { addComment, deleteComment, listComments } from '../services/comment.service.js';

export const entryRouter: Router = Router({ mergeParams: true });

entryRouter.use(requireAuth);

// Membership guard: verifies user is a trip member; attaches tripRole to res.locals
async function entryMembershipGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      // Do not leak trip existence to non-members
      res.status(404).json({ error: { message: 'Trip not found', code: 'NOT_FOUND' } });
      return;
    }

    res.locals['tripRole'] = member.tripRole;
    next();
  } catch (err) {
    next(err);
  }
}

entryRouter.use(entryMembershipGuard);

// POST / — Create entry (creator or contributor only)
entryRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const tripRole = res.locals['tripRole'] as string;
    const tripId = req.params['id']!;
    const body = req.body as CreateEntryRequest;

    if (tripRole === 'follower') {
      res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      res.status(400).json({ error: { message: 'title is required', code: 'VALIDATION_ERROR' } });
      return;
    }
    if (body.content === undefined || body.content === null || typeof body.content !== 'string' || !body.content.trim()) {
      res.status(400).json({ error: { message: 'content is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    const cc = body.clientCreatedAt;
    if (cc !== undefined && cc !== null && String(cc).trim() !== '') {
      if (typeof cc !== 'string') {
        res.status(400).json({ error: { message: 'clientCreatedAt must be a string', code: 'VALIDATION_ERROR' } });
        return;
      }
      if (!tryParseClientCreatedAt(cc.trim())) {
        res.status(400).json({ error: { message: 'Invalid clientCreatedAt', code: 'VALIDATION_ERROR' } });
        return;
      }
    }

    const ps = body.publicationStatus;
    if (ps !== undefined && ps !== null && ps !== 'draft' && ps !== 'published') {
      res.status(400).json({ error: { message: 'Invalid publicationStatus', code: 'VALIDATION_ERROR' } });
      return;
    }

    const entry = await createEntry(tripId, auth.userId, body);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

// GET / — List entries (any member, paginated)
entryRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripId = req.params['id']!;
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));

    const tripRole = res.locals['tripRole'] as TripRole;
    const result = await listEntries(tripId, page, limit, tripRole);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /locations — Lightweight location pins for all entries with a location (any member)
entryRouter.get('/locations', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripId = req.params['id']!;
    const tripRole = res.locals['tripRole'] as TripRole;
    const pins = await listEntryLocations(tripId, tripRole);
    res.json(pins);
  } catch (err) {
    next(err);
  }
});

// GET /:entryId — Entry detail (any member)
entryRouter.get('/:entryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;

    const tripRole = res.locals['tripRole'] as TripRole;
    const entry = await getEntryById(tripId, entryId, tripRole);
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// PATCH /:entryId — Update entry (trip creator or contributor)
entryRouter.patch('/:entryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripRole = res.locals['tripRole'] as TripRole;
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;
    const body = req.body as UpdateEntryRequest;

    const ps = body.publicationStatus;
    if (ps !== undefined && ps !== null && ps !== 'published') {
      res.status(400).json({ error: { message: 'Invalid publicationStatus', code: 'VALIDATION_ERROR' } });
      return;
    }

    const entry = await updateEntry(tripId, entryId, tripRole, body);
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// DELETE /:entryId — Soft-delete (trip creator or contributor)
entryRouter.delete('/:entryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripRole = res.locals['tripRole'] as TripRole;
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;

    await softDeleteEntry(tripId, entryId, tripRole);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /:entryId/reactions — Toggle reaction (any member)
entryRouter.post('/:entryId/reactions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;
    const { emoji } = req.body as { emoji: ReactionEmoji };

    const validEmojis: ReactionEmoji[] = ['❤️', '👍', '😂'];
    if (!emoji || !validEmojis.includes(emoji)) {
      res.status(400).json({ error: { message: 'Invalid emoji', code: 'VALIDATION_ERROR' } });
      return;
    }

    const tripRole = res.locals['tripRole'] as TripRole;
    const reactions = await toggleReaction(tripId, entryId, auth.userId, emoji, tripRole);
    res.json({ reactions });
  } catch (err) {
    next(err);
  }
});

// GET /:entryId/comments — List comments (any member)
entryRouter.get('/:entryId/comments', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;
    const tripRole = res.locals['tripRole'] as TripRole;
    const comments = await listComments(tripId, entryId, tripRole);
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

// POST /:entryId/comments — Add comment (any member)
entryRouter.post('/:entryId/comments', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;
    const body = req.body as AddCommentRequest;

    const tripRole = res.locals['tripRole'] as TripRole;
    const comment = await addComment(tripId, entryId, auth.userId, body.content ?? '', tripRole);
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// DELETE /:entryId/comments/:commentId — Delete comment (author only)
entryRouter.delete('/:entryId/comments/:commentId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals['auth'] as AccessTokenPayload;
    const tripId = req.params['id']!;
    const entryId = req.params['entryId']!;
    const commentId = req.params['commentId']!;
    const tripRole = res.locals['tripRole'] as TripRole;

    await deleteComment(tripId, entryId, commentId, auth.userId, tripRole);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
