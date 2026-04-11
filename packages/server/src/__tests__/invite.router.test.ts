import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Invite } from '../models/Invite.model.js';
import { Session } from '../models/Session.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { generateAccessToken, hashPassword } from '../services/auth.service.js';
import { createPlatformInvite } from '../services/invite.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-invite-router';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Trip.deleteMany({});
  await Invite.deleteMany({});
  await Session.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const app = createApp();

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

describe('POST /api/v1/invites/platform', () => {
  it('returns 403 for non-admin', async () => {
    const user = await makeUser('user@test.com', 'creator');

    const res = await request(app)
      .post('/api/v1/invites/platform')
      .set('Authorization', authHeader(String(user._id), user.email, 'creator'))
      .send({ email: 'invite@test.com', assignedAppRole: 'creator' });

    expect(res.status).toBe(403);
  });

  it('returns 201 with invite and inviteLink for admin', async () => {
    const admin = await makeUser('admin@test.com', 'admin');

    const res = await request(app)
      .post('/api/v1/invites/platform')
      .set('Authorization', authHeader(String(admin._id), admin.email, 'admin'))
      .send({ email: 'invite@test.com', assignedAppRole: 'creator' });

    expect(res.status).toBe(201);
    expect(res.body.invite.email).toBe('invite@test.com');
    expect(res.body.inviteLink).toContain('/invite/accept?token=');
  });
});

describe('GET /api/v1/invites/:token/validate', () => {
  it('returns 410 for an expired token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken, invite } = await createPlatformInvite(
      'exp@test.com',
      'creator',
      String(admin._id),
    );

    await Invite.updateOne({ _id: invite.id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).get(`/api/v1/invites/${rawToken}/validate`);
    expect(res.status).toBe(410);
  });

  it('returns 200 with email pre-filled for a valid token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken } = await createPlatformInvite(
      'valid@test.com',
      'creator',
      String(admin._id),
    );

    const res = await request(app).get(`/api/v1/invites/${rawToken}/validate`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('valid@test.com');
  });
});

describe('POST /api/v1/invites/accept', () => {
  it('returns 410 for a used (accepted) token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken, invite } = await createPlatformInvite(
      'used@test.com',
      'creator',
      String(admin._id),
    );

    await Invite.updateOne({ _id: invite.id }, { status: 'accepted' });

    const res = await request(app)
      .post('/api/v1/invites/accept')
      .send({ token: rawToken, displayName: 'Used', password: 'password123' });

    expect(res.status).toBe(410);
  });

  it('returns 201 with accessToken and sets refresh cookie for a valid token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const { rawToken } = await createPlatformInvite(
      'newuser@test.com',
      'creator',
      String(admin._id),
    );

    const res = await request(app)
      .post('/api/v1/invites/accept')
      .send({ token: rawToken, displayName: 'New User', password: 'password123' });

    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.email).toBe('newuser@test.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 409 when email is already registered', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    await makeUser('taken@test.com', 'follower');
    const { rawToken } = await createPlatformInvite(
      'taken@test.com',
      'creator',
      String(admin._id),
    );

    const res = await request(app)
      .post('/api/v1/invites/accept')
      .send({ token: rawToken, displayName: 'Taken', password: 'password123' });

    expect(res.status).toBe(409);
  });
});
