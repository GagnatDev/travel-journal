import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

// Mock the Prodigi network client (no real HTTP).
const createProdigiOrderMock = vi.fn(async () => ({ prodigiOrderId: 'pg-1', raw: {} }));
const getProdigiQuoteMock = vi.fn(async () => ({
  items: { amount: '10', currency: 'GBP' },
  shipping: { amount: '5', currency: 'GBP' },
  totalCost: { amount: '15', currency: 'GBP' },
  fetchedAt: '2026-06-17T00:00:00.000Z',
}));
vi.mock('../services/prodigi.service.js', () => ({
  createProdigiOrder: (...args: unknown[]) => createProdigiOrderMock(...(args as [])),
  getProdigiQuote: (...args: unknown[]) => getProdigiQuoteMock(...(args as [])),
}));

// Stub presigning so we never touch S3.
vi.mock('../services/media.service.js', () => ({
  generateSignedUrl: vi.fn(async (key: string) => `https://signed/${key}`),
}));

import { PhotobookOrder } from '../models/PhotobookOrder.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { hashPassword } from '../services/auth.service.js';
import {
  approveOrder,
  createPhotobookOrder,
  getQuoteForOrder,
  rejectOrder,
  retryOrder,
  sanitizeShippingAddress,
} from '../services/photobook-order.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-photobook-order';

const ADDRESS = {
  recipientName: 'Ada Lovelace',
  line1: '1 Analytical St',
  townOrCity: 'London',
  postalOrZipCode: '0001',
  countryCode: 'gb',
};

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await PhotobookOrder.deleteMany({});
  delete process.env['PHOTOBOOK_ORDER_REQUIRE_APPROVAL'];
  createProdigiOrderMock.mockClear();
  getProdigiQuoteMock.mockClear();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function makeUser(
  email: string,
  opts: { appRole?: 'admin' | 'creator' | 'follower'; ordering?: boolean } = {},
) {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole: opts.appRole ?? 'creator',
    photobookOrderingEnabled: opts.ordering ?? false,
  });
}

async function makeReadyTrip(creatorId: mongoose.Types.ObjectId) {
  return Trip.create({
    name: 'Nordic Adventure',
    status: 'completed',
    createdBy: creatorId,
    allowContributorInvites: false,
    members: [{ userId: creatorId, tripRole: 'creator', addedAt: new Date() }],
    photobookPdfJob: {
      status: 'ready',
      pdfStorageKey: 'trips/x/book.pdf',
      interiorPdfStorageKey: 'trips/x/interior.pdf',
      coverPdfStorageKey: 'trips/x/cover.pdf',
      spinePdfStorageKey: 'trips/x/spine.pdf',
      pageCount: 42,
    },
  });
}

describe('sanitizeShippingAddress', () => {
  it('uppercases the country code and drops blank optionals', () => {
    const out = sanitizeShippingAddress({ ...ADDRESS, line2: '   ', email: 'a@b.com' });
    expect(out).not.toBeNull();
    expect(out!.countryCode).toBe('GB');
    expect(out!.email).toBe('a@b.com');
    expect('line2' in out!).toBe(false);
  });

  it('returns null when required fields are missing or country code is not 2 chars', () => {
    expect(sanitizeShippingAddress({ ...ADDRESS, recipientName: '' })).toBeNull();
    expect(sanitizeShippingAddress({ ...ADDRESS, countryCode: 'GBR' })).toBeNull();
    expect(sanitizeShippingAddress(null)).toBeNull();
  });
});

describe('createPhotobookOrder entitlement + readiness', () => {
  it('rejects a non-creator with 403', async () => {
    const creator = await makeUser('creator@test.com', { ordering: true });
    const other = await makeUser('other@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);

    await expect(
      createPhotobookOrder({
        tripId: String(trip._id),
        userId: String(other._id),
        request: { shippingAddress: ADDRESS },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a creator without photobookOrderingEnabled with 403', async () => {
    const creator = await makeUser('creator@test.com', { ordering: false });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);

    await expect(
      createPhotobookOrder({
        tripId: String(trip._id),
        userId: String(creator._id),
        request: { shippingAddress: ADDRESS },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws PHOTOBOOK_NOT_READY when assets are missing', async () => {
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await Trip.create({
      name: 'Half-baked',
      status: 'completed',
      createdBy: creator._id,
      allowContributorInvites: false,
      members: [{ userId: creator._id, tripRole: 'creator', addedAt: new Date() }],
      photobookPdfJob: { status: 'ready', pdfStorageKey: 'only.pdf' },
    });

    await expect(
      createPhotobookOrder({
        tripId: String(trip._id),
        userId: String(creator._id),
        request: { shippingAddress: ADDRESS },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'PHOTOBOOK_NOT_READY' });
  });
});

describe('createPhotobookOrder workflow', () => {
  it('creates an awaiting_approval order without submitting when approval is required', async () => {
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);

    const order = await createPhotobookOrder({
      tripId: String(trip._id),
      userId: String(creator._id),
      request: { shippingAddress: ADDRESS, copies: 3 },
    });

    expect(order.status).toBe('awaiting_approval');
    expect(order.copies).toBe(3);
    expect(order.sku).toBe('BOOK-9X9-HARD');
    expect(order.pageCount).toBe(42);
    expect(createProdigiOrderMock).not.toHaveBeenCalled();
  });

  it('blocks a second open order for the same trip with 409 ORDER_ALREADY_OPEN', async () => {
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);

    await createPhotobookOrder({
      tripId: String(trip._id),
      userId: String(creator._id),
      request: { shippingAddress: ADDRESS },
    });

    await expect(
      createPhotobookOrder({
        tripId: String(trip._id),
        userId: String(creator._id),
        request: { shippingAddress: ADDRESS },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'ORDER_ALREADY_OPEN' });
  });

  it('submits immediately to Prodigi when approval is disabled', async () => {
    process.env['PHOTOBOOK_ORDER_REQUIRE_APPROVAL'] = 'false';
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);

    const order = await createPhotobookOrder({
      tripId: String(trip._id),
      userId: String(creator._id),
      request: { shippingAddress: ADDRESS },
    });

    expect(createProdigiOrderMock).toHaveBeenCalledTimes(1);
    expect(order.status).toBe('submitted');
    expect(order.prodigiOrderId).toBe('pg-1');
  });

  it('persists the address to the profile when requested', async () => {
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);

    await createPhotobookOrder({
      tripId: String(trip._id),
      userId: String(creator._id),
      request: { shippingAddress: ADDRESS, saveAddressToProfile: true },
    });

    const refreshed = await User.findById(creator._id);
    expect(refreshed!.shippingAddress!.countryCode).toBe('GB');
    expect(refreshed!.shippingAddress!.recipientName).toBe('Ada Lovelace');
  });
});

describe('admin transitions', () => {
  async function seedAwaitingOrder() {
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);
    const dto = await createPhotobookOrder({
      tripId: String(trip._id),
      userId: String(creator._id),
      request: { shippingAddress: ADDRESS },
    });
    return dto;
  }

  it('approveOrder submits and moves to submitted', async () => {
    const dto = await seedAwaitingOrder();
    const approved = await approveOrder(dto.id);
    expect(createProdigiOrderMock).toHaveBeenCalledTimes(1);
    expect(approved.status).toBe('submitted');
    expect(approved.prodigiOrderId).toBe('pg-1');
  });

  it('rejectOrder moves to rejected with an error message', async () => {
    const dto = await seedAwaitingOrder();
    const rejected = await rejectOrder(dto.id, '  out of stock  ');
    expect(rejected.status).toBe('rejected');
    expect(rejected.errorMessage).toBe('out of stock');
    expect(createProdigiOrderMock).not.toHaveBeenCalled();
  });

  it('rejectOrder is rejected for a non-awaiting order', async () => {
    process.env['PHOTOBOOK_ORDER_REQUIRE_APPROVAL'] = 'false';
    const creator = await makeUser('creator@test.com', { ordering: true });
    const trip = await makeReadyTrip(creator._id as mongoose.Types.ObjectId);
    const dto = await createPhotobookOrder({
      tripId: String(trip._id),
      userId: String(creator._id),
      request: { shippingAddress: ADDRESS },
    });
    expect(dto.status).toBe('submitted');
    await expect(rejectOrder(dto.id)).rejects.toMatchObject({ status: 409 });
  });

  it('retryOrder only works from a failed state', async () => {
    const dto = await seedAwaitingOrder();
    await expect(retryOrder(dto.id)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATUS' });

    // Drive the order into a failed state, then retry succeeds.
    await PhotobookOrder.updateOne({ _id: dto.id }, { $set: { status: 'failed' } });
    const retried = await retryOrder(dto.id);
    expect(retried.status).toBe('submitted');
    expect(createProdigiOrderMock).toHaveBeenCalledTimes(1);
  });

  it('marks the order failed (not throwing) when Prodigi rejects the submission', async () => {
    createProdigiOrderMock.mockRejectedValueOnce(new Error('Prodigi order failed: 422 bad'));
    const dto = await seedAwaitingOrder();
    const result = await approveOrder(dto.id);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('422');
  });

  it('getQuoteForOrder fetches and stores the quote', async () => {
    const dto = await seedAwaitingOrder();
    const quote = await getQuoteForOrder(dto.id);
    expect(getProdigiQuoteMock).toHaveBeenCalledTimes(1);
    expect(quote.totalCost).toEqual({ amount: '15', currency: 'GBP' });
    const stored = await PhotobookOrder.findById(dto.id);
    expect(stored!.prodigiQuote!.totalCost.amount).toBe('15');
  });
});
