/**
 * Thin HTTP client for Prodigi's Print API (v4.0).
 *
 * This module performs no DB work and has no app-state dependencies; the
 * `fetchFn` is injectable so it can be unit-tested with a fake fetch.
 *
 * TODO: The exact Prodigi order/quote request and response shapes used here are
 * derived from the sandbox docs and are parsed defensively. Confirm the live
 * `costSummary` keys (`items`/`shipping`/`totalCost`) and the order-id path
 * (`order.id` vs `id`) against the production API before going live.
 */
import type { ProdigiQuote, ProdigiShippingMethod } from '@travel-journal/shared';

export type FetchFn = typeof fetch;

export interface ProdigiRecipientAddress {
  line1: string;
  line2?: string;
  postalOrZipCode: string;
  countryCode: string;
  townOrCity: string;
  stateOrCounty?: string;
}

export interface ProdigiRecipient {
  name: string;
  email?: string;
  phoneNumber?: string;
  address: ProdigiRecipientAddress;
}

export interface ProdigiOrderParams {
  idempotencyKey: string;
  recipient: ProdigiRecipient;
  sku: string;
  copies: number;
  interiorUrl: string;
  coverUrl: string;
  spineUrl: string;
  pageCount?: number;
  shippingMethod: ProdigiShippingMethod;
}

export interface ProdigiQuoteParams {
  sku: string;
  copies: number;
  destinationCountryCode: string;
  shippingMethod: ProdigiShippingMethod;
  /** ISO string used for `fetchedAt`; injectable for deterministic tests. */
  now?: string;
}

export interface CreateProdigiOrderResult {
  prodigiOrderId: string;
  raw: unknown;
}

function prodigiBaseUrl(): string {
  const raw = process.env['PRODIGI_BASE_URL'] ?? 'https://api.sandbox.prodigi.com';
  return raw.replace(/\/+$/, '');
}

function prodigiApiKey(): string {
  return process.env['PRODIGI_API_KEY'] ?? '';
}

function prodigiHeaders(idempotencyKey?: string): Record<string, string> {
  return {
    'X-API-Key': prodigiApiKey(),
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Read a string value at a single key from an unknown object, or undefined. */
function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const v = value[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** Build a defensive ProdigiCost, tolerating missing/odd shapes. */
function readCost(value: unknown): { amount: string; currency: string } {
  const amount = readString(value, 'amount') ?? readString(value, 'value');
  const currency = readString(value, 'currency') ?? readString(value, 'currencyCode');
  return { amount: amount ?? '?', currency: currency ?? '' };
}

export async function createProdigiOrder(
  params: ProdigiOrderParams,
  fetchFn: FetchFn = fetch,
): Promise<CreateProdigiOrderResult> {
  const url = `${prodigiBaseUrl()}/v4.0/orders`;

  const interiorAsset: Record<string, unknown> = {
    printArea: 'default',
    url: params.interiorUrl,
    ...(params.pageCount !== undefined ? { pageCount: params.pageCount } : {}),
  };

  const body = {
    idempotencyKey: params.idempotencyKey,
    recipient: params.recipient,
    items: [
      {
        sku: params.sku,
        copies: params.copies,
        sizing: 'fillPrintArea',
        assets: [
          interiorAsset,
          { printArea: 'cover', url: params.coverUrl },
          { printArea: 'spine', url: params.spineUrl },
        ],
      },
    ],
    shippingMethod: params.shippingMethod,
  };

  const res = await fetchFn(url, {
    method: 'POST',
    headers: prodigiHeaders(params.idempotencyKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Prodigi order failed: ${res.status} ${text}`);
  }

  const json: unknown = await res.json().catch(() => ({}));
  const order = isRecord(json) ? json['order'] : undefined;
  const prodigiOrderId = readString(order, 'id') ?? readString(json, 'id');

  if (!prodigiOrderId) {
    throw new Error('Prodigi order response did not include an order id');
  }

  return { prodigiOrderId, raw: json };
}

export async function getProdigiQuote(
  params: ProdigiQuoteParams,
  fetchFn: FetchFn = fetch,
): Promise<ProdigiQuote> {
  const url = `${prodigiBaseUrl()}/v4.0/quotes`;

  const body = {
    shippingMethod: params.shippingMethod,
    destinationCountryCode: params.destinationCountryCode,
    items: [
      {
        sku: params.sku,
        copies: params.copies,
        assets: [{ printArea: 'default' }],
      },
    ],
  };

  const res = await fetchFn(url, {
    method: 'POST',
    headers: prodigiHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Prodigi quote failed: ${res.status} ${text}`);
  }

  const json: unknown = await res.json().catch(() => ({}));
  const quotes = isRecord(json) ? json['quotes'] : undefined;
  const firstQuote = Array.isArray(quotes) ? quotes[0] : undefined;
  const costSummary = isRecord(firstQuote) ? firstQuote['costSummary'] : undefined;

  return {
    items: readCost(isRecord(costSummary) ? costSummary['items'] : undefined),
    shipping: readCost(isRecord(costSummary) ? costSummary['shipping'] : undefined),
    totalCost: readCost(isRecord(costSummary) ? costSummary['totalCost'] : undefined),
    fetchedAt: params.now ?? new Date().toISOString(),
  };
}
