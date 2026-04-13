/**
 * In-memory ref-counted cache for authenticated media blob URLs.
 * Avoids refetching and revoking on every component remount (e.g. story mode toggle).
 */

const MAX_READY_ENTRIES = 120;

type ReadyEntry = {
  objectUrl: string;
  refCount: number;
  /** When refCount hit 0, for LRU eviction */
  idleAt: number | null;
};

type InflightState = {
  box: { waiters: number };
  promise: Promise<string>;
};

const ready = new Map<string, ReadyEntry>();
const inflight = new Map<string, InflightState>();

function promoteToEnd(key: string): void {
  const e = ready.get(key);
  if (!e) return;
  ready.delete(key);
  ready.set(key, e);
}

function evictOldestIdle(): void {
  if (ready.size < MAX_READY_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [k, e] of ready) {
    if (e.refCount === 0 && e.idleAt !== null && e.idleAt < oldestTime) {
      oldestTime = e.idleAt;
      oldestKey = k;
    }
  }
  if (oldestKey) {
    const e = ready.get(oldestKey)!;
    URL.revokeObjectURL(e.objectUrl);
    ready.delete(oldestKey);
  }
}

/**
 * Returns a blob object URL for this cache key. Multiple concurrent callers share one fetch.
 * Call {@link releaseMediaObjectUrl} when the consumer unmounts or no longer needs the URL.
 */
export function acquireMediaObjectUrl(key: string, load: () => Promise<Blob>): Promise<string> {
  const hit = ready.get(key);
  if (hit) {
    hit.refCount += 1;
    hit.idleAt = null;
    promoteToEnd(key);
    return Promise.resolve(hit.objectUrl);
  }

  const existing = inflight.get(key);
  if (existing) {
    existing.box.waiters += 1;
    return existing.promise;
  }

  const box = { waiters: 1 };
  const promise = (async () => {
    try {
      const blob = await load();
      inflight.delete(key);
      if (box.waiters <= 0) {
        throw new Error('Media load cancelled');
      }
      const objectUrl = URL.createObjectURL(blob);
      evictOldestIdle();
      ready.set(key, { objectUrl, refCount: box.waiters, idleAt: null });
      return objectUrl;
    } catch (err) {
      inflight.delete(key);
      throw err;
    }
  })();

  inflight.set(key, { box, promise });
  return promise;
}

/**
 * Decrement refs for a ready entry, or drop an in-flight load waiter.
 */
export function releaseMediaObjectUrl(key: string): void {
  const inf = inflight.get(key);
  if (inf) {
    inf.box.waiters -= 1;
    return;
  }

  const hit = ready.get(key);
  if (!hit) return;

  hit.refCount -= 1;
  if (hit.refCount <= 0) {
    hit.refCount = 0;
    hit.idleAt = Date.now();
    promoteToEnd(key);
  }
}
