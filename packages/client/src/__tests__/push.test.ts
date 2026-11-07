import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchVapidPublicKey: vi.fn(),
  upsertPushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

vi.mock('../api/notifications.js', () => api);

import { ensurePushSubscription, subscriptionMatchesServerKey } from '../notifications/push.js';

/** base64url without padding, like a VAPID public key. */
function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const OLD_KEY = new Uint8Array(65).fill(1);
const NEW_KEY = new Uint8Array(65).fill(2);

function fakeSubscription(endpoint: string, key: Uint8Array | null) {
  return {
    endpoint,
    options: { applicationServerKey: key ? key.buffer.slice(0) : null },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } }),
  };
}

function installPushEnvironment(existing: ReturnType<typeof fakeSubscription> | null) {
  const created = fakeSubscription('https://push.example/new', NEW_KEY);
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe: vi.fn().mockResolvedValue(created),
  };
  const registration = { pushManager };
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  });
  return { pushManager, created };
}

beforeEach(() => {
  api.fetchVapidPublicKey.mockResolvedValue({ publicKey: toBase64Url(NEW_KEY) });
  api.upsertPushSubscription.mockResolvedValue({ success: true });
  api.deletePushSubscription.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('subscriptionMatchesServerKey', () => {
  it('compares the subscription key bytes with the server key', () => {
    const sub = fakeSubscription('e', NEW_KEY) as unknown as PushSubscription;
    expect(subscriptionMatchesServerKey(sub, NEW_KEY)).toBe(true);
    expect(subscriptionMatchesServerKey(sub, OLD_KEY)).toBe(false);
  });

  it('treats an unknown subscription key as a match', () => {
    const sub = fakeSubscription('e', null) as unknown as PushSubscription;
    expect(subscriptionMatchesServerKey(sub, NEW_KEY)).toBe(true);
  });
});

describe('ensurePushSubscription', () => {
  it('replaces a subscription made under the previous VAPID key', async () => {
    const stale = fakeSubscription('https://push.example/old', OLD_KEY);
    const { pushManager } = installPushEnvironment(stale);

    await ensurePushSubscription('token');

    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(api.deletePushSubscription).toHaveBeenCalledWith('token', 'https://push.example/old');
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(api.upsertPushSubscription).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ endpoint: 'https://push.example/new' }),
      expect.any(String),
      toBase64Url(NEW_KEY),
    );
  });

  it('keeps a subscription that already uses the server key', async () => {
    const fresh = fakeSubscription('https://push.example/current', NEW_KEY);
    const { pushManager } = installPushEnvironment(fresh);

    await ensurePushSubscription('token');

    expect(fresh.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.deletePushSubscription).not.toHaveBeenCalled();
    expect(api.upsertPushSubscription).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ endpoint: 'https://push.example/current' }),
      expect.any(String),
      toBase64Url(NEW_KEY),
    );
  });

  it('still re-subscribes when cleaning up the old endpoint fails', async () => {
    const stale = fakeSubscription('https://push.example/old', OLD_KEY);
    stale.unsubscribe.mockRejectedValue(new Error('gone'));
    api.deletePushSubscription.mockRejectedValue(new Error('network'));
    const { pushManager } = installPushEnvironment(stale);

    await ensurePushSubscription('token');

    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(api.upsertPushSubscription).toHaveBeenCalledOnce();
  });
});
