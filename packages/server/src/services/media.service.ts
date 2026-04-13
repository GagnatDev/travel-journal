import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Response } from 'express';
import sharp from 'sharp';

import { getTripById } from './trip.service.js';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Authenticated media: immutable object keys — safe for long browser cache. */
const MEDIA_CACHE_CONTROL = 'private, max-age=86400, immutable';

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9100',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'minioadmin',
      secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'minioadmin',
    },
    forcePathStyle: true,
  });
}

const BUCKET = process.env['S3_BUCKET'] ?? 'travel-journal';

/** Compare client `If-None-Match` (possibly list) to a single strong ETag from storage. */
function ifNoneMatchIncludesServerEtag(ifNoneMatchHeader: string, serverEtag: string | undefined): boolean {
  if (!serverEtag) return false;
  const normalize = (t: string) => t.trim().replace(/^W\//i, '').replaceAll('"', '');
  const server = normalize(serverEtag);
  return ifNoneMatchHeader.split(',').some((p) => normalize(p) === server);
}

function s3ErrorName(err: unknown): string {
  return err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
}

export async function uploadMedia(
  fileBuffer: Buffer,
  mimeType: string,
  tripId: string,
  width: number,
  height: number,
): Promise<{ key: string; thumbnailKey?: string; width: number; height: number }> {
  const ext = ALLOWED_MIME_TYPES[mimeType];
  if (!ext) {
    throw createHttpError('Unsupported media type', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    throw createHttpError('File too large', 413, 'FILE_TOO_LARGE');
  }

  const id = randomUUID();
  const key = `media/${tripId}/${id}.${ext}`;
  const thumbnailKey = `media/${tripId}/${id}.thumb.webp`;
  const client = createS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    }),
  );

  let thumbnailKeyOut: string | undefined;
  try {
    const thumbBuf = await sharp(fileBuffer)
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbnailKey,
        Body: thumbBuf,
        ContentType: 'image/webp',
      }),
    );
    thumbnailKeyOut = thumbnailKey;
  } catch {
    // Original is stored; timeline can fall back to full key for thumbnails.
  }

  return {
    key,
    width,
    height,
    ...(thumbnailKeyOut !== undefined && { thumbnailKey: thumbnailKeyOut }),
  };
}

export async function generateSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
  const client = createS3Client();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

/**
 * Stream object bytes to the client. Used for authenticated media reads so the browser
 * never follows a cross-origin redirect to object storage (which would require bucket CORS).
 *
 * @param ifNoneMatch - raw `If-None-Match` header; when set, uses S3 conditional HEAD to return 304 without a body.
 */
export async function streamMediaObject(
  key: string,
  res: Response,
  ifNoneMatch?: string | null,
): Promise<void> {
  const client = createS3Client();

  const inm = ifNoneMatch?.trim();
  if (inm && inm !== '*') {
    let headOut;
    try {
      headOut = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (err: unknown) {
      const name = s3ErrorName(err);
      const http404 =
        err && typeof err === 'object' && '$metadata' in err
          ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
          : false;
      if (name === 'NoSuchKey' || name === 'NotFound' || http404) {
        res.status(404).json({ error: { message: 'Media not found', code: 'NOT_FOUND' } });
        return;
      }
      throw err;
    }
    if (ifNoneMatchIncludesServerEtag(inm, headOut.ETag)) {
      res.status(304);
      res.setHeader('Cache-Control', MEDIA_CACHE_CONTROL);
      res.setHeader('ETag', headOut.ETag ?? inm);
      res.end();
      return;
    }
  }

  let out;
  try {
    out = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err: unknown) {
    const name = s3ErrorName(err);
    if (name === 'NoSuchKey' || name === 'NotFound') {
      res.status(404).json({ error: { message: 'Media not found', code: 'NOT_FOUND' } });
      return;
    }
    throw err;
  }

  const body = out.Body;
  if (!body) {
    res.status(404).json({ error: { message: 'Media not found', code: 'NOT_FOUND' } });
    return;
  }

  const contentType = out.ContentType ?? 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  if (typeof out.ContentLength === 'number') {
    res.setHeader('Content-Length', String(out.ContentLength));
  }
  if (out.ETag) {
    res.setHeader('ETag', out.ETag);
  }
  res.setHeader('Cache-Control', MEDIA_CACHE_CONTROL);

  const readable = body as Readable;
  await pipeline(readable, res);
}

export async function assertMediaAccess(key: string, userId: string): Promise<void> {
  const parts = key.split('/');
  const tripId = parts[1];

  if (!tripId) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }

  const trip = await getTripById(tripId);
  if (!trip) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }

  const isMember = trip.members.some((m) => String(m.userId) === userId);
  if (!isMember) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
}
