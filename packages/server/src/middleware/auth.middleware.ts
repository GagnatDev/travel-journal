import { NextFunction, Request, Response } from 'express';
import type { AppRole } from '@travel-journal/shared';

import { verifyAccessToken } from '../services/auth.service.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    res.locals['auth'] = payload;
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' } });
  }
}

export function requireAppRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const auth = res.locals['auth'] as { appRole: AppRole } | undefined;
      if (!auth || !roles.includes(auth.appRole)) {
        res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
        return;
      }
      next();
    });
  };
}
