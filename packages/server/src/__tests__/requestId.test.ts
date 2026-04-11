import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { createApp } from '../app.js';

describe('X-Request-Id header', () => {
  const app = createApp();

  it('attaches a unique X-Request-Id to every response', async () => {
    const res = await request(app).get('/healthz');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates different IDs for concurrent requests', async () => {
    const [res1, res2] = await Promise.all([
      request(app).get('/healthz'),
      request(app).get('/healthz'),
    ]);

    const id1 = res1.headers['x-request-id'];
    const id2 = res2.headers['x-request-id'];

    expect(id1).not.toBe(id2);
  });
});
