import { describe, it, expect, beforeEach } from 'vitest';

import { createProdigiOrder, getProdigiQuote } from '../services/prodigi.service.js';
import type { ProdigiOrderParams, ProdigiQuoteParams } from '../services/prodigi.service.js';

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(
  captured: Captured[],
  response: { ok: boolean; status: number; json?: unknown; text?: string },
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json ?? {},
      text: async () => response.text ?? '',
    } as Response;
  }) as unknown as typeof fetch;
}

const orderParams: ProdigiOrderParams = {
  idempotencyKey: 'order-abc',
  recipient: {
    name: 'Ada Lovelace',
    address: {
      line1: '1 Analytical St',
      postalOrZipCode: '0001',
      countryCode: 'GB',
      townOrCity: 'London',
    },
  },
  sku: 'BOOK-9X9-HARD',
  copies: 2,
  interiorUrl: 'https://signed/interior',
  coverUrl: 'https://signed/cover',
  spineUrl: 'https://signed/spine',
  pageCount: 40,
  shippingMethod: 'Budget',
};

beforeEach(() => {
  delete process.env['PRODIGI_BASE_URL'];
  process.env['PRODIGI_API_KEY'] = 'test-key';
});

describe('createProdigiOrder', () => {
  it('posts to the orders endpoint with headers, idempotency key and asset body', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, {
      ok: true,
      status: 200,
      json: { order: { id: 'pg-123' } },
    });

    const result = await createProdigiOrder(orderParams, fetchFn);

    expect(result.prodigiOrderId).toBe('pg-123');
    expect(captured).toHaveLength(1);
    const call = captured[0]!;
    expect(call.url).toBe('https://api.sandbox.prodigi.com/v4.0/orders');

    const headers = call.init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('test-key');
    expect(headers['Idempotency-Key']).toBe('order-abc');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(call.init.body as string);
    expect(body.shippingMethod).toBe('Budget');
    expect(body.items[0].sizing).toBe('fillPrintArea');
    expect(body.items[0].copies).toBe(2);
    const assets = body.items[0].assets;
    expect(assets.map((a: { printArea: string }) => a.printArea)).toEqual([
      'default',
      'cover',
      'spine',
    ]);
    expect(assets[0].pageCount).toBe(40);
    expect(assets[0].url).toBe('https://signed/interior');
  });

  it('falls back to json.id when order.id is absent', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, { ok: true, status: 200, json: { id: 'pg-flat' } });
    const result = await createProdigiOrder(orderParams, fetchFn);
    expect(result.prodigiOrderId).toBe('pg-flat');
  });

  it('throws including the status on a non-2xx response', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, { ok: false, status: 422, text: 'bad request' });
    await expect(createProdigiOrder(orderParams, fetchFn)).rejects.toThrow(/422/);
  });

  it('omits pageCount from the interior asset when undefined', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, { ok: true, status: 200, json: { order: { id: 'x' } } });
    const { pageCount: _omit, ...rest } = orderParams;
    void _omit;
    await createProdigiOrder(rest, fetchFn);
    const body = JSON.parse(captured[0]!.init.body as string);
    expect(body.items[0].assets[0].pageCount).toBeUndefined();
  });
});

describe('getProdigiQuote', () => {
  const quoteParams: ProdigiQuoteParams = {
    sku: 'BOOK-9X9-HARD',
    copies: 1,
    destinationCountryCode: 'GB',
    shippingMethod: 'Budget',
    now: '2026-06-17T00:00:00.000Z',
  };

  it('posts to the quotes endpoint and parses cost summary', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, {
      ok: true,
      status: 200,
      json: {
        quotes: [
          {
            costSummary: {
              items: { amount: '10', currency: 'GBP' },
              shipping: { amount: '5', currency: 'GBP' },
              totalCost: { amount: '15', currency: 'GBP' },
            },
          },
        ],
      },
    });

    const quote = await getProdigiQuote(quoteParams, fetchFn);

    expect(captured[0]!.url).toBe('https://api.sandbox.prodigi.com/v4.0/quotes');
    const body = JSON.parse(captured[0]!.init.body as string);
    expect(body.destinationCountryCode).toBe('GB');
    expect(body.items[0].assets[0].printArea).toBe('default');

    expect(quote.items).toEqual({ amount: '10', currency: 'GBP' });
    expect(quote.shipping).toEqual({ amount: '5', currency: 'GBP' });
    expect(quote.totalCost).toEqual({ amount: '15', currency: 'GBP' });
    expect(quote.fetchedAt).toBe('2026-06-17T00:00:00.000Z');
  });

  it('does not throw on a missing cost summary; fills defaults', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, { ok: true, status: 200, json: { quotes: [{}] } });
    const quote = await getProdigiQuote(quoteParams, fetchFn);
    expect(quote.items).toEqual({ amount: '?', currency: '' });
    expect(quote.totalCost).toEqual({ amount: '?', currency: '' });
  });

  it('throws including the status on a non-2xx response', async () => {
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, { ok: false, status: 500, text: 'boom' });
    await expect(getProdigiQuote(quoteParams, fetchFn)).rejects.toThrow(/500/);
  });

  it('honors the PRODIGI_BASE_URL override and strips a trailing slash', async () => {
    process.env['PRODIGI_BASE_URL'] = 'https://prodigi.example.com/';
    const captured: Captured[] = [];
    const fetchFn = fakeFetch(captured, { ok: true, status: 200, json: { quotes: [{}] } });
    await getProdigiQuote(quoteParams, fetchFn);
    expect(captured[0]!.url).toBe('https://prodigi.example.com/v4.0/quotes');
  });
});
