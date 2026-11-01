import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type {
  ObjectHead,
  ObjectListing,
  ObjectStore,
  PutOptions,
  StoredObject,
} from '../../storage/objectStore.js';

interface Entry {
  data: Buffer;
  contentType?: string;
  etag: string;
}

async function toBuffer(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/** In-memory {@link ObjectStore} with S3-like ETags (quoted MD5), for tests. */
export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Entry>();
  readonly calls: string[] = [];
  failPutFor = new Set<string>();

  constructor(readonly name: string) {}

  seed(key: string, data: string | Buffer, contentType?: string): void {
    const buf = Buffer.from(data);
    this.objects.set(key, {
      data: buf,
      etag: `"${createHash('md5').update(buf).digest('hex')}"`,
      ...(contentType !== undefined && { contentType }),
    });
  }

  async put(key: string, body: Buffer | Readable, options: PutOptions = {}): Promise<void> {
    this.calls.push(`put:${key}`);
    if (this.failPutFor.has(key)) throw new Error(`put failed for ${key}`);
    this.seed(key, await toBuffer(body), options.contentType);
  }

  async get(key: string): Promise<StoredObject | null> {
    this.calls.push(`get:${key}`);
    const e = this.objects.get(key);
    if (!e) return null;
    return {
      body: Readable.from([e.data]),
      contentLength: e.data.length,
      etag: e.etag,
      ...(e.contentType !== undefined && { contentType: e.contentType }),
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    this.calls.push(`head:${key}`);
    const e = this.objects.get(key);
    if (!e) return null;
    return {
      contentLength: e.data.length,
      etag: e.etag,
      ...(e.contentType !== undefined && { contentType: e.contentType }),
    };
  }

  async delete(key: string): Promise<void> {
    this.calls.push(`delete:${key}`);
    this.objects.delete(key);
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    this.calls.push(`presign:${key}`);
    return `https://${this.name}.example/${key}?ttl=${ttlSeconds}`;
  }

  async *list(prefix?: string): AsyncIterable<ObjectListing> {
    for (const [key, e] of [...this.objects.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (prefix && !key.startsWith(prefix)) continue;
      yield { key, size: e.data.length, etag: e.etag };
    }
  }
}
