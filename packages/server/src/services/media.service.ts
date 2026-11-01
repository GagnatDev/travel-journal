import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import type { Response } from 'express';
import sharp from 'sharp';

import { getObjectStore } from '../storage/index.js';
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

/** Upload a generated PDF to object storage (trip-scoped key). */
export async function uploadTripPdf(tripId: string, buffer: Buffer): Promise<string> {
  const id = randomUUID();
  const key = `pdf/${tripId}/${id}.pdf`;
  await getObjectStore().put(key, buffer, { contentType: 'application/pdf' });
  return key;
}

function ifNoneMatchIncludesServerEtag(ifNoneMatchHeader: string, serverEtag: string | undefined): boolean {
  if (!serverEtag) return false;
  const normalize = (t: string) => t.trim().replace(/^W\//i, '').replaceAll('"', '');
  const server = normalize(serverEtag);
  return ifNoneMatchHeader.split(',').some((p) => normalize(p) === server);
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
  const store = getObjectStore();

  await store.put(key, fileBuffer, { contentType: mimeType });

  let thumbnailKeyOut: string | undefined;
  try {
    const thumbBuf = await sharp(fileBuffer)
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    await store.put(thumbnailKey, thumbBuf, { contentType: 'image/webp' });
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
  return getObjectStore().presignGet(key, ttlSeconds);
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
  options?: { attachmentFilename?: string },
): Promise<void> {
  const store = getObjectStore();
  const notFound = () =>
    res.status(404).json({ error: { message: 'Media not found', code: 'NOT_FOUND' } });

  const inm = ifNoneMatch?.trim();
  if (inm && inm !== '*') {
    const headOut = await store.head(key);
    if (!headOut) {
      notFound();
      return;
    }
    if (ifNoneMatchIncludesServerEtag(inm, headOut.etag)) {
      res.status(304);
      res.setHeader('Cache-Control', MEDIA_CACHE_CONTROL);
      res.setHeader('ETag', headOut.etag ?? inm);
      res.end();
      return;
    }
  }

  const out = await store.get(key);
  if (!out) {
    notFound();
    return;
  }

  const contentType = out.contentType ?? 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  if (options?.attachmentFilename) {
    const safe = options.attachmentFilename.replace(/[^\w\s.-]/g, '').trim().slice(0, 120) || 'download.pdf';
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  }
  if (typeof out.contentLength === 'number') {
    res.setHeader('Content-Length', String(out.contentLength));
  }
  if (out.etag) {
    res.setHeader('ETag', out.etag);
  }
  res.setHeader('Cache-Control', MEDIA_CACHE_CONTROL);

  await pipeline(out.body, res);
}

/** Read full object bytes from S3 (e.g. for server-side PDF assembly). */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await getObjectStore().get(key);
  if (!out) {
    throw createHttpError('Media not found', 404, 'NOT_FOUND');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of out.body) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export async function assertMediaAccess(key: string, userId: string): Promise<void> {
  // Avatar keys (avatars/{ownerId}/...) are accessible to any authenticated user.
  if (key.startsWith('avatars/')) {
    if (!userId) {
      throw createHttpError('Forbidden', 403, 'FORBIDDEN');
    }
    return;
  }

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

/** Upload a user avatar; converts to WebP and resizes to at most 512px. */
export async function uploadAvatar(fileBuffer: Buffer, mimeType: string, userId: string): Promise<string> {
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    throw createHttpError('Unsupported media type', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  const processed = await sharp(fileBuffer)
    .rotate()
    .resize(512, 512, { fit: 'cover', position: 'center', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const id = randomUUID();
  const key = `avatars/${userId}/${id}.webp`;

  await getObjectStore().put(key, processed, { contentType: 'image/webp' });

  return key;
}

/** Delete an object from storage by key (best-effort; swallows not-found). */
export async function deleteObject(key: string): Promise<void> {
  try {
    await getObjectStore().delete(key);
  } catch {
    // best-effort
  }
}
