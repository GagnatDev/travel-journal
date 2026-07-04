import { Router, Request, Response, NextFunction } from 'express';
import type {
  AccessTokenPayload,
  CreatePhotobookOrderRequest,
  PhotobookOrderStatus,
} from '@travel-journal/shared';

import { requireAppRole, requireAuth } from '../middleware/auth.middleware.js';
import {
  approveOrder,
  createPhotobookOrder,
  getQuoteForOrder,
  getUserOrderForTrip,
  listAdminOrders,
  rejectOrder,
  retryOrder,
} from '../services/photobook-order.service.js';

export const photobookOrderRouter: Router = Router();

const KNOWN_STATUSES: PhotobookOrderStatus[] = [
  'requested',
  'awaiting_approval',
  'submitting',
  'submitted',
  'failed',
  'rejected',
  'cancelled',
];

function parseStatus(value: unknown): PhotobookOrderStatus | undefined {
  if (typeof value === 'string' && (KNOWN_STATUSES as string[]).includes(value)) {
    return value as PhotobookOrderStatus;
  }
  return undefined;
}

// --- User routes ------------------------------------------------------------

// POST /trips/:tripId/photobook/order — create an order for a trip
photobookOrderRouter.post(
  '/trips/:tripId/photobook/order',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const tripId = req.params['tripId']!;
      const request = (req.body ?? {}) as CreatePhotobookOrderRequest;
      const order = await createPhotobookOrder({ tripId, userId: auth.userId, request });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  },
);

// GET /trips/:tripId/photobook/order — latest order for the authenticated user
photobookOrderRouter.get(
  '/trips/:tripId/photobook/order',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = res.locals['auth'] as AccessTokenPayload;
      const tripId = req.params['tripId']!;
      const order = await getUserOrderForTrip(tripId, auth.userId);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

// --- Admin routes -----------------------------------------------------------

// GET /admin/photobook-orders?status= — list all orders
photobookOrderRouter.get(
  '/admin/photobook-orders',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = parseStatus(req.query['status']);
      const orders = await listAdminOrders({ ...(status ? { status } : {}) });
      res.json(orders);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/photobook-orders/:orderId/quote — fetch a Prodigi quote
photobookOrderRouter.get(
  '/admin/photobook-orders/:orderId/quote',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const quote = await getQuoteForOrder(req.params['orderId']!);
      res.json(quote);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/photobook-orders/:orderId/approve
photobookOrderRouter.post(
  '/admin/photobook-orders/:orderId/approve',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await approveOrder(req.params['orderId']!);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/photobook-orders/:orderId/reject — body { reason? }
photobookOrderRouter.post(
  '/admin/photobook-orders/:orderId/reject',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reason = (req.body as { reason?: string } | undefined)?.reason;
      const order = await rejectOrder(req.params['orderId']!, reason);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/photobook-orders/:orderId/retry
photobookOrderRouter.post(
  '/admin/photobook-orders/:orderId/retry',
  requireAppRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await retryOrder(req.params['orderId']!);
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);
