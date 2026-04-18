import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { authRouter } from './routes/auth.router.js';
import { inviteRouter } from './routes/invite.router.js';
import { mediaRouter } from './routes/media.router.js';
import { notificationRouter } from './routes/notification.router.js';
import { tripRouter } from './routes/trip.router.js';
import { userRouter } from './routes/user.router.js';
import { logger } from './logger.js';

function parseTrustProxy(): number | false {
  const raw = process.env['TRUST_PROXY'];
  if (raw === undefined || raw === '' || raw === '0' || raw === 'false') {
    return false;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1) {
    return n;
  }
  return 1;
}

function parseCorsOrigins(): string[] {
  const raw = process.env['CORS_ORIGINS'];
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function createApp(): Express {
  const app = express();
  const publicDir = join(__dirname, 'public');
  const indexHtmlPath = join(publicDir, 'index.html');

  const trustProxy = parseTrustProxy();
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.use(
    helmet({
      // SPA is built separately; enable CSP at the edge or tune directives before turning on.
      contentSecurityPolicy: false,
    }),
  );

  const corsOrigins = parseCorsOrigins();
  if (corsOrigins.length > 0) {
    const allowed = new Set(corsOrigins);
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin) {
            callback(null, true);
            return;
          }
          callback(null, allowed.has(origin));
        },
        credentials: true,
      }),
    );
  }

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
