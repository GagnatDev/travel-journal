import { NextFunction, Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import type {
  AccessTokenPayload,
  AppNotification,
  DeletePushSubscriptionRequest,
  ListNotificationsResponse,
  NotificationData,
  NotificationType,
  UpsertPushSubscriptionRequest,
} from '@travel-journal/shared';

import { requireAuth } from '../middleware/auth.middleware.js';
import { Notification } from '../models/Notification.model.js';
import { PushSubscription } from '../models/PushSubscription.model.js';

export const notificationRouter: Router = Router();

notificationRouter.use(requireAuth);

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

function toAppNotification(doc: {
  _id: mongoose.Types.ObjectId;
  type: NotificationType;
  data: NotificationData;
  readAt: Date | null;
  createdAt: Date;
}): AppNotification {
  return {
    id: String(doc._id),
    type: doc.type,
    createdAt: doc.createdAt.toISOString(),
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
    data: doc.data,
  };
}

// --- Push subscription + VAPID routes (legacy paths, must be registered
// before any `/:id` patterns so `/subscriptions` and `/vapid-public-key` are
// not matched as notification ids). ----------------------------------------

notificationRouter.post(
  '/subscriptions',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const { subscription, deviceLabel } = req.body as UpsertPushSubscriptionRequest;

      if (!subscription?.endpoint || typeof subscription.endpoint !== 'string') {
        res.status(400).json({
          error: { message: 'subscription.endpoint is required', code: 'VALIDATION_ERROR' },
        });
        return;
      }
      if (
        !subscription.keys ||
        typeof subscription.keys.p256dh !== 'string' ||
        typeof subscription.keys.auth !== 'string'
      ) {
        res.status(400).json({
          error: { message: 'subscription.keys are required', code: 'VALIDATION_ERROR' },
        });
        return;
      }

      await PushSubscription.updateOne(
        {
          userId: new mongoose.Types.ObjectId(auth.userId),
          endpoint: subscription.endpoint.trim(),
        },
        {
          $set: {
            keys: subscription.keys,
            deviceLabel: typeof deviceLabel === 'string' ? deviceLabel.trim() : undefined,
            disabledAt: null,
          },
        },
        {
          upsert: true,
        },
      );

      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.delete(
  '/subscriptions',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const { endpoint } = req.body as DeletePushSubscriptionRequest;

      if (!endpoint || typeof endpoint !== 'string') {
        res
          .status(400)
          .json({ error: { message: 'endpoint is required', code: 'VALIDATION_ERROR' } });
        return;
      }

      await PushSubscription.deleteOne({
        userId: new mongoose.Types.ObjectId(auth.userId),
        endpoint: endpoint.trim(),
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.get(
  '/vapid-public-key',
  async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const publicKey = process.env['WEB_PUSH_VAPID_PUBLIC_KEY'];
    if (!publicKey) {
      res.status(503).json({
        error: { message: 'Push notifications are unavailable', code: 'PUSH_UNAVAILABLE' },
      });
      return;
    }
    res.json({ publicKey });
  },
);

// --- Inbox routes ---------------------------------------------------------

notificationRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const userId = new mongoose.Types.ObjectId(auth.userId);
      const limitRaw = Number.parseInt(String(req.query['limit'] ?? ''), 10);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(limitRaw, MAX_LIST_LIMIT)
          : DEFAULT_LIST_LIMIT;

      const [docs, unreadCount] = await Promise.all([
        Notification.find({
          userId,
          $or: [{ dismissedAt: null }, { dismissedAt: { $exists: false } }],
        })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        Notification.countDocuments({
          userId,
          readAt: null,
          $or: [{ dismissedAt: null }, { dismissedAt: { $exists: false } }],
        }),
      ]);

      const response: ListNotificationsResponse = {
        notifications: docs.map((doc) =>
          toAppNotification({
            _id: doc._id,
            type: doc.type,
            data: doc.data,
            readAt: doc.readAt ?? null,
            createdAt: doc.createdAt,
          }),
        ),
        unreadCount,
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.post(
  '/read-all',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const userId = new mongoose.Types.ObjectId(auth.userId);
      await Notification.updateMany(
        {
          userId,
          readAt: null,
          $or: [{ dismissedAt: null }, { dismissedAt: { $exists: false } }],
        },
        { $set: { readAt: new Date() } },
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.delete(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const now = new Date();
      await Notification.updateMany(
        {
          userId: new mongoose.Types.ObjectId(auth.userId),
          $or: [{ dismissedAt: null }, { dismissedAt: { $exists: false } }],
        },
        { $set: { dismissedAt: now, readAt: now } },
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.post(
  '/:id/read',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const id = String(req.params['id'] ?? '');
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: { message: 'Invalid id', code: 'VALIDATION_ERROR' } });
        return;
      }
      const result = await Notification.updateOne(
        {
          _id: new mongoose.Types.ObjectId(id),
          userId: new mongoose.Types.ObjectId(auth.userId),
          readAt: null,
        },
        { $set: { readAt: new Date() } },
      );
      if (result.matchedCount === 0) {
        const exists = await Notification.exists({
          _id: new mongoose.Types.ObjectId(id),
          userId: new mongoose.Types.ObjectId(auth.userId),
        });
        if (!exists) {
          res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
          return;
        }
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const id = String(req.params['id'] ?? '');
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: { message: 'Invalid id', code: 'VALIDATION_ERROR' } });
        return;
      }
      const now = new Date();
      const result = await Notification.updateOne(
        {
          _id: new mongoose.Types.ObjectId(id),
          userId: new mongoose.Types.ObjectId(auth.userId),
        },
        { $set: { dismissedAt: now, readAt: now } },
      );
      if (result.matchedCount === 0) {
        res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
