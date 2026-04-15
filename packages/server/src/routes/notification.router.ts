import { NextFunction, Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import type {
  AccessTokenPayload,
  DeletePushSubscriptionRequest,
  UpsertPushSubscriptionRequest,
} from '@travel-journal/shared';

import { requireAuth } from '../middleware/auth.middleware.js';
import { PushSubscription } from '../models/PushSubscription.model.js';

export const notificationRouter: Router = Router();

notificationRouter.use(requireAuth);

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
