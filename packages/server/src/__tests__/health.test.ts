import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { createApp } from '../app.js';

describe('GET /healthz', () => {
  const app = createApp();

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /readyz', () => {
  const app = createApp();

  it('returns 503 when database is not connected', async () => {
    // In unit tests, mongoose is not connected to a real DB
    const res = await request(app).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });
});
