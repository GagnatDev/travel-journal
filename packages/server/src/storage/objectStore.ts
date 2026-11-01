import type { Readable } from 'node:stream';

/** Object bytes plus the metadata needed to serve them. */
export interface StoredObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
}

export interface ObjectHead {
  contentType?: string;
  contentLength?: number;
  etag?: string;
}

export interface ObjectListing {
  key: string;
  size?: number;
  etag?: string;
}

export interface PutOptions {
  contentType?: string;
  /** Required by S3 when `body` is a stream. */
  contentLength?: number;
}

/**
 * Bucket-agnostic object storage. Business code talks to this interface only, never
 * to an S3 client or a bucket name, so the backing bucket can change by config alone
 * (see `docs/storage.md`). Keys (`media/…`, `avatars/…`, `pdf/…`) are the same in every
 * backend, which is why stored keys in MongoDB never need rewriting.
 */
export interface ObjectStore {
  /** Human-readable identity for logs, e.g. `legacy` / `homectl`. */
  readonly name: string;
  put(key: string, body: Buffer | Readable, options?: PutOptions): Promise<void>;
  /** `null` when the object does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** `null` when the object does not exist. */
  head(key: string): Promise<ObjectHead | null>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  list(prefix?: string): AsyncIterable<ObjectListing>;
}
