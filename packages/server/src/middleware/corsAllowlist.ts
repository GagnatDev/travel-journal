import cors from 'cors';
import type { Express } from 'express';

function parseCorsOrigins(): string[] {
  const raw = process.env['CORS_ORIGINS'];
  if (!raw?.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Cross-origin browser access only when CORS_ORIGINS lists explicit origins. */
export function applyCorsAllowlist(app: Express): void {
  const corsOrigins = parseCorsOrigins();
  if (corsOrigins.length === 0) return;

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
