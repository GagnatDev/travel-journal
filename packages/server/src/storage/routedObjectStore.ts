import type { Readable } from 'node:stream';

import type {
  ObjectHead,
  ObjectListing,
  ObjectStore,
  PutOptions,
  StoredObject,
} from './objectStore.js';

/**
 * - `legacy`    — everything in the legacy bucket (outside the cluster).
 * - `migrating` — writes go to the homectl bucket; reads try homectl first and fall back
 *                 to legacy for objects not copied yet; deletes hit both.
 * - `homectl`   — everything in the in-cluster `homectl-reisedagbok` bucket.
 */
export type StorageMode = 'legacy' | 'migrating' | 'homectl';

export const STORAGE_MODES: readonly StorageMode[] = ['legacy', 'migrating', 'homectl'];

export type LegacyFallbackListener = (op: 'get' | 'head' | 'presignGet', key: string) => void;

interface RoutedBackends {
  legacy?: ObjectStore;
  homectl?: ObjectStore;
}

function requireBackend(store: ObjectStore | undefined, which: string, mode: StorageMode): ObjectStore {
  if (!store) throw new Error(`Storage mode "${mode}" requires the ${which} backend`);
  return store;
}

/** Routes each operation to the right bucket for the current {@link StorageMode}. */
export class RoutedObjectStore implements ObjectStore {
  readonly name: string;
  readonly mode: StorageMode;
  /** Where writes go; also the only read source outside `migrating`. */
  private readonly primary: ObjectStore;
  /** Read fallback + secondary delete target; only set in `migrating`. */
  private readonly fallback: ObjectStore | undefined;
  private readonly onLegacyFallback: LegacyFallbackListener | undefined;

  constructor(mode: StorageMode, backends: RoutedBackends, onLegacyFallback?: LegacyFallbackListener) {
    this.mode = mode;
    this.name = `routed:${mode}`;
    this.onLegacyFallback = onLegacyFallback;
    if (mode === 'legacy') {
      this.primary = requireBackend(backends.legacy, 'legacy', mode);
    } else if (mode === 'homectl') {
      this.primary = requireBackend(backends.homectl, 'homectl', mode);
    } else {
      this.primary = requireBackend(backends.homectl, 'homectl', mode);
      this.fallback = requireBackend(backends.legacy, 'legacy', mode);
    }
  }

  put(key: string, body: Buffer | Readable, options?: PutOptions): Promise<void> {
    return this.primary.put(key, body, options);
  }

  async get(key: string): Promise<StoredObject | null> {
    const hit = await this.primary.get(key);
    if (hit || !this.fallback) return hit;
    const legacy = await this.fallback.get(key);
    if (legacy) this.onLegacyFallback?.('get', key);
    return legacy;
  }

  async head(key: string): Promise<ObjectHead | null> {
    const hit = await this.primary.head(key);
    if (hit || !this.fallback) return hit;
    const legacy = await this.fallback.head(key);
    if (legacy) this.onLegacyFallback?.('head', key);
    return legacy;
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    if (!this.fallback || (await this.primary.head(key))) {
      return this.primary.presignGet(key, ttlSeconds);
    }
    this.onLegacyFallback?.('presignGet', key);
    return this.fallback.presignGet(key, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    if (!this.fallback) return this.primary.delete(key);
    // Delete from both so an object can't reappear via the legacy read fallback.
    const results = await Promise.allSettled([this.primary.delete(key), this.fallback.delete(key)]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }

  list(prefix?: string): AsyncIterable<ObjectListing> {
    return this.primary.list(prefix);
  }
}
