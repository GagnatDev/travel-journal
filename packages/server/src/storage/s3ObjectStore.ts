import type { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  ObjectHead,
  ObjectListing,
  ObjectStore,
  PutOptions,
  StoredObject,
} from './objectStore.js';

export interface S3BackendConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function isS3NotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'NoSuchKey' || name === 'NotFound') return true;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status === 404;
}

/** One S3-compatible bucket (Scaleway Object Storage, or MinIO locally). */
export class S3ObjectStore implements ObjectStore {
  readonly name: string;
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(name: string, config: S3BackendConfig) {
    this.name = name;
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async put(key: string, body: Buffer | Readable, options: PutOptions = {}): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ...(options.contentType !== undefined && { ContentType: options.contentType }),
        ...(options.contentLength !== undefined && { ContentLength: options.contentLength }),
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    let out;
    try {
      out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err: unknown) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
    if (!out.Body) return null;
    return {
      body: out.Body as Readable,
      ...(out.ContentType !== undefined && { contentType: out.ContentType }),
      ...(typeof out.ContentLength === 'number' && { contentLength: out.ContentLength }),
      ...(out.ETag !== undefined && { etag: out.ETag }),
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    let out;
    try {
      out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err: unknown) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
    return {
      ...(out.ContentType !== undefined && { contentType: out.ContentType }),
      ...(typeof out.ContentLength === 'number' && { contentLength: out.ContentLength }),
      ...(out.ETag !== undefined && { etag: out.ETag }),
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err: unknown) {
      if (isS3NotFound(err)) return;
      throw err;
    }
  }

  presignGet(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  async *list(prefix?: string): AsyncIterable<ObjectListing> {
    let token: string | undefined;
    do {
      const out = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ...(prefix !== undefined && { Prefix: prefix }),
          ...(token !== undefined && { ContinuationToken: token }),
        }),
      );
      for (const obj of out.Contents ?? []) {
        if (!obj.Key) continue;
        yield {
          key: obj.Key,
          ...(typeof obj.Size === 'number' && { size: obj.Size }),
          ...(obj.ETag !== undefined && { etag: obj.ETag }),
        };
      }
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
  }
}
