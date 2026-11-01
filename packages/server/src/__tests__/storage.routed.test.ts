import { describe, it, expect, vi } from 'vitest';

import { RoutedObjectStore } from '../storage/routedObjectStore.js';
import { MemoryObjectStore } from './helpers/memoryObjectStore.js';

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString();
}

function setup() {
  const legacy = new MemoryObjectStore('legacy');
  const homectl = new MemoryObjectStore('homectl');
  return { legacy, homectl };
}

describe('RoutedObjectStore', () => {
  describe('legacy mode', () => {
    it('reads and writes only the legacy bucket', async () => {
      const { legacy, homectl } = setup();
      const store = new RoutedObjectStore('legacy', { legacy, homectl });

      await store.put('media/t1/a.jpg', Buffer.from('a'), { contentType: 'image/jpeg' });
      expect(legacy.objects.has('media/t1/a.jpg')).toBe(true);
      expect((await store.head('media/t1/a.jpg'))?.contentType).toBe('image/jpeg');
      expect(await store.presignGet('media/t1/a.jpg', 60)).toContain('legacy.example');
      await store.delete('media/t1/a.jpg');

      expect(legacy.objects.size).toBe(0);
      expect(homectl.calls).toEqual([]);
    });

    it('requires the legacy backend', () => {
      expect(() => new RoutedObjectStore('legacy', { homectl: new MemoryObjectStore('h') })).toThrow(
        /legacy backend/,
      );
    });
  });

  describe('homectl mode', () => {
    it('reads and writes only the homectl bucket, with no legacy fallback', async () => {
      const { legacy, homectl } = setup();
      legacy.seed('media/t1/old.jpg', 'old');
      const store = new RoutedObjectStore('homectl', { legacy, homectl });

      await store.put('media/t1/new.jpg', Buffer.from('new'));
      expect(homectl.objects.has('media/t1/new.jpg')).toBe(true);
      expect(await store.get('media/t1/old.jpg')).toBeNull();
      expect(legacy.calls).toEqual([]);
    });
  });

  describe('migrating mode', () => {
    it('writes new objects to homectl only', async () => {
      const { legacy, homectl } = setup();
      const store = new RoutedObjectStore('migrating', { legacy, homectl });

      await store.put('avatars/u1/x.webp', Buffer.from('x'));
      expect(homectl.objects.has('avatars/u1/x.webp')).toBe(true);
      expect(legacy.objects.size).toBe(0);
    });

    it('reads homectl first and does not touch legacy on a hit', async () => {
      const { legacy, homectl } = setup();
      homectl.seed('media/t1/a.jpg', 'from-homectl');
      legacy.seed('media/t1/a.jpg', 'from-legacy');
      const onFallback = vi.fn();
      const store = new RoutedObjectStore('migrating', { legacy, homectl }, onFallback);

      const got = await store.get('media/t1/a.jpg');
      expect(await readAll(got!.body)).toBe('from-homectl');
      expect(legacy.calls).toEqual([]);
      expect(onFallback).not.toHaveBeenCalled();
    });

    it('falls back to legacy for objects not copied yet and reports it', async () => {
      const { legacy, homectl } = setup();
      legacy.seed('media/t1/old.jpg', 'from-legacy', 'image/jpeg');
      const onFallback = vi.fn();
      const store = new RoutedObjectStore('migrating', { legacy, homectl }, onFallback);

      const got = await store.get('media/t1/old.jpg');
      expect(await readAll(got!.body)).toBe('from-legacy');
      expect((await store.head('media/t1/old.jpg'))?.contentType).toBe('image/jpeg');
      expect(onFallback).toHaveBeenCalledWith('get', 'media/t1/old.jpg');
      expect(onFallback).toHaveBeenCalledWith('head', 'media/t1/old.jpg');
    });

    it('returns null (and no fallback event) when neither bucket has the object', async () => {
      const { legacy, homectl } = setup();
      const onFallback = vi.fn();
      const store = new RoutedObjectStore('migrating', { legacy, homectl }, onFallback);

      expect(await store.get('media/t1/missing.jpg')).toBeNull();
      expect(await store.head('media/t1/missing.jpg')).toBeNull();
      expect(onFallback).not.toHaveBeenCalled();
    });

    it('presigns against whichever bucket has the object', async () => {
      const { legacy, homectl } = setup();
      homectl.seed('pdf/t1/new.pdf', 'n');
      legacy.seed('pdf/t1/old.pdf', 'o');
      const store = new RoutedObjectStore('migrating', { legacy, homectl });

      expect(await store.presignGet('pdf/t1/new.pdf', 3600)).toBe('https://homectl.example/pdf/t1/new.pdf?ttl=3600');
      expect(await store.presignGet('pdf/t1/old.pdf', 3600)).toBe('https://legacy.example/pdf/t1/old.pdf?ttl=3600');
    });

    it('deletes from both buckets so the legacy copy cannot resurface', async () => {
      const { legacy, homectl } = setup();
      homectl.seed('media/t1/a.jpg', 'a');
      legacy.seed('media/t1/a.jpg', 'a');
      const store = new RoutedObjectStore('migrating', { legacy, homectl });

      await store.delete('media/t1/a.jpg');
      expect(homectl.objects.size).toBe(0);
      expect(legacy.objects.size).toBe(0);
      expect(await store.get('media/t1/a.jpg')).toBeNull();
    });

    it('still deletes from homectl when the legacy delete fails, then reports the error', async () => {
      const { legacy, homectl } = setup();
      homectl.seed('media/t1/a.jpg', 'a');
      legacy.delete = vi.fn().mockRejectedValue(new Error('legacy down'));
      const store = new RoutedObjectStore('migrating', { legacy, homectl });

      await expect(store.delete('media/t1/a.jpg')).rejects.toThrow('legacy down');
      expect(homectl.objects.size).toBe(0);
    });

    it('requires both backends', () => {
      const { legacy, homectl } = setup();
      expect(() => new RoutedObjectStore('migrating', { homectl })).toThrow(/legacy backend/);
      expect(() => new RoutedObjectStore('migrating', { legacy })).toThrow(/homectl backend/);
    });
  });
});
