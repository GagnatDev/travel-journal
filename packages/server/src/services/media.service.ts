import { randomUUID } from 'node:crypto';

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getTripById } from './trip.service.js';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

export async function uploadMedia(
  fileBuffer: Buffer,
  mimeType: string,
  tripId: string,
  width: number,
  height: number,
): Promise<{ key: string; width: number; height: number }> {
  const ext = ALLOWED_MIME_TYPES[mimeType];
  if (!ext) {
    throw createHttpError('Unsupported media type', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    throw createHttpError('File too large', 413, 'FILE_TOO_LARGE');
  }

  const key = `media/${tripId}/${randomUUID()}.${ext}`;
  const client = createS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    }),
  );

  return { key, width, height };
}

export async function generateSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
  const client = createS3Client();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
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
