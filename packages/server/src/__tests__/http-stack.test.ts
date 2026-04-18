import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

describe('HTTP stack hardening', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      JSON_BODY_LIMIT: process.env['JSON_BODY_LIMIT'],
      CORS_ORIGINS: process.env['CORS_ORIGINS'],
      TRUST_PROXY: process.env['TRUST_PROXY'],
    };
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('sets security headers via helmet', async () => {
    const app = createApp();
    const res = await request(app).get('/healthz');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('enables trust proxy when TRUST_PROXY is a positive integer', async () => {
    process.env['TRUST_PROXY'] = '1';
    const app = createApp();
    expect(app.get('trust proxy')).toBe(1);
  });

  it('does not enable trust proxy when TRUST_PROXY is unset', async () => {
    delete process.env['TRUST_PROXY'];
    const app = createApp();
    expect(app.get('trust proxy')).toBe(false);
  });

  it('returns 413 when JSON body exceeds JSON_BODY_LIMIT', async () => {
    process.env['JSON_BODY_LIMIT'] = '100b';
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'x'.repeat(200), password: 'y' }));

    expect(res.status).toBe(413);
  });

  it('does not send CORS headers when CORS_ORIGINS is unset', async () => {
    delete process.env['CORS_ORIGINS'];
    const app = createApp();
    const res = await request(app).get('/healthz').set('Origin', 'https://other.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('reflects Access-Control-Allow-Origin for an allowed origin', async () => {
    process.env['CORS_ORIGINS'] = 'https://app.example.com';
    const app = createApp();
    const res = await request(app)
      .get('/healthz')
      .set('Origin', 'https://app.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('does not allow a disallowed Origin', async () => {
    process.env['CORS_ORIGINS'] = 'https://app.example.com';
    const app = createApp();
    const res = await request(app)
      .get('/healthz')
      .set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
