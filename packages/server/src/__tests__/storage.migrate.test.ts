import { describe, it, expect } from 'vitest';

import { copyAllObjects, isSameObject } from '../storage/migrate.js';
import { parseArgs } from '../scripts/storage-migrate.js';
import { MemoryObjectStore } from './helpers/memoryObjectStore.js';

describe('copyAllObjects', () => {
  it('copies every object with its content type and is idempotent', async () => {
    const legacy = new MemoryObjectStore('legacy');
    const homectl = new MemoryObjectStore('homectl');
    legacy.seed('media/t1/a.jpg', 'aaa', 'image/jpeg');
    legacy.seed('media/t1/a.thumb.webp', 'th', 'image/webp');
    legacy.seed('avatars/u1/x.webp', 'xx', 'image/webp');
    legacy.seed('pdf/t1/p.pdf', 'pdf', 'application/pdf');

    const first = await copyAllObjects(legacy, homectl, { concurrency: 2 });
    expect(first).toMatchObject({ scanned: 4, copied: 4, skipped: 0, failed: 0, bytesCopied: 10 });
    expect([...homectl.objects.keys()].sort()).toEqual([...legacy.objects.keys()].sort());
    expect(homectl.objects.get('pdf/t1/p.pdf')?.contentType).toBe('application/pdf');
    expect(homectl.objects.get('media/t1/a.jpg')?.etag).toBe(legacy.objects.get('media/t1/a.jpg')?.etag);

    const second = await copyAllObjects(legacy, homectl);
    expect(second).toMatchObject({ scanned: 4, copied: 0, skipped: 4, failed: 0 });
  });

  it('re-copies an object whose target copy differs', async () => {
    const legacy = new MemoryObjectStore('legacy');
    const homectl = new MemoryObjectStore('homectl');
    legacy.seed('media/t1/a.jpg', 'correct');
    homectl.seed('media/t1/a.jpg', 'partial');

    const result = await copyAllObjects(legacy, homectl);
    expect(result.copied).toBe(1);
    expect(homectl.objects.get('media/t1/a.jpg')?.data.toString()).toBe('correct');
  });

  it('dry run counts what would be copied without writing', async () => {
    const legacy = new MemoryObjectStore('legacy');
    const homectl = new MemoryObjectStore('homectl');
    legacy.seed('media/t1/a.jpg', 'a');
    legacy.seed('media/t1/b.jpg', 'b');
    homectl.seed('media/t1/b.jpg', 'b');

    const result = await copyAllObjects(legacy, homectl, { dryRun: true });
    expect(result).toMatchObject({ dryRun: true, scanned: 2, copied: 1, skipped: 1 });
    expect(homectl.objects.has('media/t1/a.jpg')).toBe(false);
    expect(homectl.calls.some((c) => c.startsWith('put:'))).toBe(false);
  });

  it('honours the prefix', async () => {
    const legacy = new MemoryObjectStore('legacy');
    const homectl = new MemoryObjectStore('homectl');
    legacy.seed('media/t1/a.jpg', 'a');
    legacy.seed('avatars/u1/x.webp', 'x');

    const result = await copyAllObjects(legacy, homectl, { prefix: 'avatars/' });
    expect(result.scanned).toBe(1);
    expect([...homectl.objects.keys()]).toEqual(['avatars/u1/x.webp']);
  });

  it('keeps going past failures and reports them', async () => {
    const legacy = new MemoryObjectStore('legacy');
    const homectl = new MemoryObjectStore('homectl');
    legacy.seed('media/t1/a.jpg', 'a');
    legacy.seed('media/t1/b.jpg', 'b');
    homectl.failPutFor.add('media/t1/a.jpg');

    const result = await copyAllObjects(legacy, homectl);
    expect(result).toMatchObject({ copied: 1, failed: 1 });
    expect(result.failures).toEqual([{ key: 'media/t1/a.jpg', error: 'put failed for media/t1/a.jpg' }]);
  });
});

describe('isSameObject', () => {
  it('compares size and (normalised) ETag when present', () => {
    expect(isSameObject({ key: 'k', size: 3, etag: '"abc"' }, { contentLength: 3, etag: 'abc' })).toBe(true);
    expect(isSameObject({ key: 'k', size: 3, etag: '"abc"' }, { contentLength: 4, etag: '"abc"' })).toBe(false);
    expect(isSameObject({ key: 'k', size: 3, etag: '"abc"' }, { contentLength: 3, etag: '"def"' })).toBe(false);
    expect(isSameObject({ key: 'k', size: 3 }, { contentLength: 3 })).toBe(true);
  });
});

describe('storage-migrate parseArgs', () => {
  it('parses flags', () => {
    expect(parseArgs(['--', '--dry-run', '--prefix=media/', '--concurrency=8'])).toEqual({
      dryRun: true,
      prefix: 'media/',
      concurrency: 8,
    });
    expect(parseArgs([])).toEqual({ dryRun: false });
  });

  it('rejects unknown flags and bad concurrency', () => {
    expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--concurrency=0'])).toThrow(/Invalid --concurrency/);
  });
});
