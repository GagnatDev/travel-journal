import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import webpush from 'web-push';

import { PushSubscription } from '../models/PushSubscription.model.js';
import { deliverWebPush } from '../services/notification.service.js';
import { readVapidConfig } from '../services/vapidConfig.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27019/travel-journal-test-notification-vapid';

const VAPID_VARS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'WEB_PUSH_VAPID_PUBLIC_KEY',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'WEB_PUSH_SUBJECT',
] as const;

const current = webpush.generateVAPIDKeys();
const previous = webpush.generateVAPIDKeys();
const userId = new mongoose.Types.ObjectId();

const push = {
  title: 'New release',
  body: 'v2',
  data: { type: 'system.release_announcement' as const, version: '2.0.0' },
};

function setVapidEnv(keys: { publicKey: string; privateKey: string }, prefix: 'VAPID_' | 'WEB_PUSH_') {
  if (prefix === 'VAPID_') {
    process.env['VAPID_PUBLIC_KEY'] = keys.publicKey;
    process.env['VAPID_PRIVATE_KEY'] = keys.privateKey;
    process.env['VAPID_SUBJECT'] = 'mailto:admin@homectl.no';
  } else {
    process.env['WEB_PUSH_VAPID_PUBLIC_KEY'] = keys.publicKey;
    process.env['WEB_PUSH_VAPID_PRIVATE_KEY'] = keys.privateKey;
    process.env['WEB_PUSH_SUBJECT'] = 'mailto:test@example.com';
  }
}

async function makeSubscription(endpoint: string, vapidPublicKey?: string) {
  return PushSubscription.create({
    userId,
    endpoint,
    keys: { p256dh: 'p', auth: 'a' },
    ...(vapidPublicKey !== undefined && { vapidPublicKey }),
  });
}

const saved: Partial<Record<(typeof VAPID_VARS)[number], string | undefined>> = {};

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  for (const name of VAPID_VARS) saved[name] = process.env[name];
});

beforeEach(async () => {
  for (const name of VAPID_VARS) delete process.env[name];
  await PushSubscription.deleteMany({});
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const name of VAPID_VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('readVapidConfig', () => {
  it('prefers the Terraform VAPID_* names', () => {
    setVapidEnv(current, 'VAPID_');
    setVapidEnv(previous, 'WEB_PUSH_');
    expect(readVapidConfig()).toMatchObject({
      publicKey: current.publicKey,
      privateKey: current.privateKey,
      subject: 'mailto:admin@homectl.no',
      source: 'VAPID_*',
    });
  });

  it('falls back to the original WEB_PUSH_* names', () => {
    setVapidEnv(previous, 'WEB_PUSH_');
    expect(readVapidConfig()).toMatchObject({ publicKey: previous.publicKey, source: 'WEB_PUSH_*' });
  });

  it('never mixes halves from the two sets', () => {
    process.env['VAPID_PUBLIC_KEY'] = current.publicKey; // incomplete VAPID_* set
    setVapidEnv(previous, 'WEB_PUSH_');
    expect(readVapidConfig()).toMatchObject({
      publicKey: previous.publicKey,
      privateKey: previous.privateKey,
      source: 'WEB_PUSH_*',
    });
  });

  it('returns null when no set is complete', () => {
    process.env['VAPID_PUBLIC_KEY'] = current.publicKey;
    process.env['VAPID_PRIVATE_KEY'] = current.privateKey;
    expect(readVapidConfig()).toBeNull();
  });
});

describe('deliverWebPush after a VAPID key change', () => {
  beforeEach(() => setVapidEnv(current, 'VAPID_'));

  it('signs with the VAPID_* keypair', async () => {
    const setDetails = vi.spyOn(webpush, 'setVapidDetails');
    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);
    await makeSubscription('https://push.example/a', current.publicKey);

    // Configure with a different key first so this call must re-configure.
    setVapidEnv(previous, 'WEB_PUSH_');
    delete process.env['VAPID_PUBLIC_KEY'];
    await deliverWebPush([userId], push);
    setVapidEnv(current, 'VAPID_');
    await deliverWebPush([userId], push);

    expect(setDetails).toHaveBeenLastCalledWith(
      'mailto:admin@homectl.no',
      current.publicKey,
      current.privateKey,
    );
  });

  it('disables subscriptions recorded under another key without sending to them', async () => {
    const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);
    await makeSubscription('https://push.example/stale', previous.publicKey);
    await makeSubscription('https://push.example/fresh', current.publicKey);

    await deliverWebPush([userId], push);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ endpoint: 'https://push.example/fresh' });
    const stale = await PushSubscription.findOne({ endpoint: 'https://push.example/stale' });
    const fresh = await PushSubscription.findOne({ endpoint: 'https://push.example/fresh' });
    expect(stale?.disabledAt).toBeInstanceOf(Date);
    expect(fresh?.disabledAt).toBeFalsy();
  });

  it.each([401, 403])('disables a legacy (unrecorded key) subscription on %i', async (statusCode) => {
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue({ statusCode });
    await makeSubscription('https://push.example/legacy');

    await deliverWebPush([userId], push);

    const doc = await PushSubscription.findOne({ endpoint: 'https://push.example/legacy' });
    expect(doc?.disabledAt).toBeInstanceOf(Date);
  });

  it('does not disable a subscription recorded with the current key on 403', async () => {
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue({ statusCode: 403 });
    await makeSubscription('https://push.example/current', current.publicKey);

    await deliverWebPush([userId], push);

    const doc = await PushSubscription.findOne({ endpoint: 'https://push.example/current' });
    expect(doc?.disabledAt).toBeFalsy();
  });

  it('records the current key on a legacy subscription that still works', async () => {
    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as never);
    await makeSubscription('https://push.example/legacy-ok');

    await deliverWebPush([userId], push);

    const doc = await PushSubscription.findOne({ endpoint: 'https://push.example/legacy-ok' });
    expect(doc?.vapidPublicKey).toBe(current.publicKey);
    expect(doc?.disabledAt).toBeFalsy();
  });
});
