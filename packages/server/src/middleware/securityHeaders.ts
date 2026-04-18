import type { Express } from 'express';
import helmet from 'helmet';

/** Sensible defaults; CSP is off here so the SPA bundle can be tuned independently or at the edge. */
export function applySecurityHeaders(app: Express): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
}
