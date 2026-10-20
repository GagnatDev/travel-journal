import type { NextFunction, Request, Response } from 'express';

/**
 * Express 5 leaves `req.body` undefined when no parser populated it.
 * Express 4 used `{}`. Restore that so handlers can read optional fields
 * without throwing TypeError on body-less JSON requests.
 *
 * @see https://expressjs.com/en/guide/migrating-5.html#req-body
 */
export function defaultEmptyJsonBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body === undefined) {
    req.body = {};
  }
  next();
}
