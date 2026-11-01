import { test, expect } from '@playwright/test';

const SERVER_BASE = `http://localhost:${process.env['SERVER_PORT'] ?? '8085'}`;

test.describe('Health endpoints', () => {
  test('GET /health returns 200 with status ok', async ({ request }) => {
    const res = await request.get(`${SERVER_BASE}/health`);

    expect(res.status()).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  test('GET /readyz returns 200 when connected to real MongoDB', async ({ request }) => {
    const res = await request.get(`${SERVER_BASE}/readyz`);

    expect(res.status()).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  test('responses include X-Request-Id header', async ({ request }) => {
    const res = await request.get(`${SERVER_BASE}/health`);

    expect(res.headers()['x-request-id']).toBeTruthy();
  });
});
