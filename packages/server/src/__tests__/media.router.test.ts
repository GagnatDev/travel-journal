import { Readable } from 'node:stream';

import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { User } from '../models/User.model.js';
import { Trip } from '../models/Trip.model.js';
import { hashPassword, generateAccessToken } from '../services/auth.service.js';
import { createTrip } from '../services/trip.service.js';

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockImplementation(async (command: { input?: Record<string, unknown> }) => {
    const input = command.input;
    if (input && 'Body' in input) {
      return {};
    }
    return {
      ContentType: 'image/jpeg',
      ContentLength: 9,
      Body: Readable.from([Buffer.from('fake jpeg')]),
    };
  });
  const S3Client = vi.fn(() => ({ send: mockSend }));
  const PutObjectCommand = vi.fn();
  const GetObjectCommand = vi.fn();
  return { S3Client, PutObjectCommand, GetObjectCommand, __mockSend: mockSend };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url?X-Amz=abc'),
}));

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-media-router';

const app = createApp();

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

async function makeUser(email: string, appRole: 'admin' | 'creator' | 'follower' = 'creator') {
  return User.create({
    email,
    passwordHash: await hashPassword('password'),
    displayName: email.split('@')[0]!,
    appRole,
  });
}

function authHeader(userId: string, email: string, appRole: 'admin' | 'creator' | 'follower') {
  const token = generateAccessToken({ userId, email, appRole });
  return `Bearer ${token}`;
}

describe('POST /api/v1/media/upload', () => {
  it('unauthenticated → 401', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('fake'), { filename: 'test.jpg', contentType: 'image/jpeg' })
      .field('tripId', 'some-trip-id')
      .field('width', '100')
      .field('height', '100');

    expect(res.status).toBe(401);
  });

  it('non-member → 403', async () => {
    const creator = await makeUser('creator@test.com');
    const stranger = await makeUser('stranger@test.com');
    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', authHeader(String(stranger._id), stranger.email, 'creator'))
      .attach('file', Buffer.from('fake jpeg'), { filename: 'test.jpg', contentType: 'image/jpeg' })
      .field('tripId', trip.id)
      .field('width', '100')
      .field('height', '100');

    expect(res.status).toBe(403);
  });

  it('file over 10 MB → 413', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 'x');

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .attach('file', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' })
      .field('tripId', trip.id)
      .field('width', '100')
      .field('height', '100');

    expect(res.status).toBe(413);
  });

  it('invalid MIME type → 415', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .attach('file', Buffer.from('fake gif'), { filename: 'test.gif', contentType: 'image/gif' })
      .field('tripId', trip.id)
      .field('width', '100')
      .field('height', '100');

    expect(res.status).toBe(415);
  });

  it('valid upload → 201 { key, url }', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));

    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'))
      .attach('file', Buffer.from('fake jpeg'), { filename: 'test.jpg', contentType: 'image/jpeg' })
      .field('tripId', trip.id)
      .field('width', '800')
      .field('height', '600');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('key');
    expect(res.body).toHaveProperty('url');
    expect(res.body.url).toBe(`/api/v1/media/${res.body.key}`);
  });
});

describe('GET /api/v1/media/:key', () => {
  it('non-member → 403', async () => {
    const creator = await makeUser('creator@test.com');
    const stranger = await makeUser('stranger@test.com');
    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));

    const res = await request(app)
      .get(`/api/v1/media/media/${trip.id}/abc.jpg`)
      .set('Authorization', authHeader(String(stranger._id), stranger.email, 'creator'));

    expect(res.status).toBe(403);
  });

  it('member → 200 and streams image bytes from object storage', async () => {
    const creator = await makeUser('creator@test.com');
    const trip = await createTrip({ name: 'Test Trip' }, String(creator._id));

    const res = await request(app)
      .get(`/api/v1/media/media/${trip.id}/abc.jpg`)
      .set('Authorization', authHeader(String(creator._id), creator.email, 'creator'));

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('image/jpeg');
    expect(res.headers['location']).toBeUndefined();
    expect(res.body).toEqual(Buffer.from('fake jpeg'));
  });
});
