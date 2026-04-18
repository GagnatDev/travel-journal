import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import cookieParser from 'cookie-parser';
import express, { Express, NextFunction, Request, Response } from 'express';

import { applyCorsAllowlist } from './middleware/corsAllowlist.js';
import { applySecurityHeaders } from './middleware/securityHeaders.js';
import { applyTrustProxy } from './middleware/trustProxy.js';
import { authRouter } from './routes/auth.router.js';
import { inviteRouter } from './routes/invite.router.js';
import { mediaRouter } from './routes/media.router.js';
import { notificationRouter } from './routes/notification.router.js';
import { tripRouter } from './routes/trip.router.js';
import { userRouter } from './routes/user.router.js';
import { logger } from './logger.js';

export function createApp(): Express {
  const app = express();
  const publicDir = join(__dirname, 'public');
  const indexHtmlPath = join(publicDir, 'index.html');

  applyTrustProxy(app);
  applySecurityHeaders(app);
  applyCorsAllowlist(app);

  const jsonBodyLimit = process.env['JSON_BODY_LIMIT'] ?? '1mb';
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(cookieParser());

  // Request-ID middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    res.locals['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // Health endpoints
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req: Request, res: Response) => {
    try {
      const { default: mongoose } = await import('mongoose');
      if (mongoose.connection.readyState !== 1) {
        throw new Error('not connected');
      }
      await mongoose.connection.db?.admin().ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // API routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/trips', tripRouter);
  app.use('/api/v1/invites', inviteRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/media', mediaRouter);
  app.use('/api/v1/notifications', notificationRouter);

  if (existsSync(indexHtmlPath)) {
    app.use(express.static(publicDir));

    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }

      res.sendFile(indexHtmlPath);
    });
  }

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const requestId = res.locals['requestId'] as string;
    logger.error({ requestId, err, path: req.path }, 'Unhandled error');

    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({
      error: {
        message: err.message ?? 'Internal server error',
        code: (err as { code?: string }).code ?? 'INTERNAL_ERROR',
        requestId,
      },
    });
  });

  return app;
}
