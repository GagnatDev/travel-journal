import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';

import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { hashPassword } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';
import { uploadMedia, generateSignedUrl, assertMediaAccess } from '../services/media.service.js';

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  const S3Client = vi.fn(() => ({ send: mockSend }));
  const PutObjectCommand = vi.fn();
  const GetObjectCommand = vi.fn();
  return { S3Client, PutObjectCommand, GetObjectCommand, __mockSend: mockSend };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url?X-Amz=abc'),
}));

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-media-service';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('uploadMedia', () => {
  it('throws 415 for unsupported MIME type', async () => {
    const buffer = Buffer.from('fake data');
    await expect(uploadMedia(buffer, 'image/gif', 'trip-123', 100, 100)).rejects.toMatchObject({
      status: 415,
    });
  });

  it('throws 413 for file over 10 MB', async () => {
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(uploadMedia(bigBuffer, 'image/jpeg', 'trip-123', 100, 100)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('valid upload calls S3 send and returns key/width/height', async () => {
    const { __mockSend } = await import('@aws-sdk/client-s3') as unknown as { __mockSend: ReturnType<typeof vi.fn> };
    __mockSend.mockClear();

    const buffer = Buffer.from('fake jpeg content');
    const result = await uploadMedia(buffer, 'image/jpeg', 'trip-abc', 800, 600);

    expect(__mockSend).toHaveBeenCalledTimes(1);
    expect(result.key).toMatch(/^media\/trip-abc\/.+\.jpg$/);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });
});

describe('generateSignedUrl', () => {
  it('calls getSignedUrl with the correct key and returns a signed URL string', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    (getSignedUrl as ReturnType<typeof vi.fn>).mockClear();

    const url = await generateSignedUrl('media/trip-abc/file.jpg');

    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    expect(typeof url).toBe('string');
    expect(url).toContain('s3.example.com');
  });
});

describe('assertMediaAccess', () => {
  it('passes for a trip member', async () => {
    const user = await User.create({
      email: 'member@test.com',
      passwordHash: await hashPassword('password'),
      displayName: 'Member',
      appRole: 'creator',
    });

    const trip = await createTrip({ name: 'Test Trip' }, String(user._id));
    const key = `media/${trip.id}/file.jpg`;

    await expect(assertMediaAccess(key, String(user._id))).resolves.toBeUndefined();
  });

  it('throws 403 for non-member', async () => {
    const creator = await User.create({
      email: 'creator@test.com',
      passwordHash: await hashPassword('password'),
      displayName: 'Creator',
      appRole: 'creator',
    });

    const nonMember = await User.create({
      email: 'stranger@test.com',
      passwordHash: await hashPassword('password'),
      displayName: 'Stranger',
      appRole: 'creator',
    });

    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));
    const key = `media/${trip.id}/file.jpg`;

    await expect(assertMediaAccess(key, String(nonMember._id))).rejects.toMatchObject({
      status: 403,
    });
  });
});
