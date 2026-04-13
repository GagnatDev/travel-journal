import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describe('SPA static serving', () => {
  const publicDir = join(__dirname, '..', 'public');
  const indexPath = join(publicDir, 'index.html');

  beforeAll(async () => {
    await mkdir(publicDir, { recursive: true });
    await writeFile(indexPath, '<!doctype html><html><body>travel-journal</body></html>');
  });

  afterAll(async () => {
    await rm(publicDir, { recursive: true, force: true });
  });

  it('serves index.html for root path when built client exists', async () => {
    const app = createApp();
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('travel-journal');
  });
});
