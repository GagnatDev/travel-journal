import type { Express } from 'express';

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

/** When behind a reverse proxy that sets X-Forwarded-*, set trust so req.ip and secure cookies are correct. */
export function applyTrustProxy(app: Express): void {
  const trustProxy = parseTrustProxy();
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }
}
