import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { AdminPasswordResetToken } from '../models/AdminPasswordResetToken.model.js';
import { Session } from '../models/Session.model.js';
import { User } from '../models/User.model.js';
import { generateRefreshToken, hashPassword, hashToken, verifyPassword } from '../services/auth.service.js';
import {
  completeAdminPasswordReset,
  createAdminPasswordResetLink,
  validateAdminPasswordResetToken,
} from '../services/adminPasswordReset.service.js';

const MONGO_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-test-admin-pw-reset';

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
  await Session.deleteMany({});
  await AdminPasswordResetToken.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function makeUser(email: string, appRole: 'admin' | 'creator' | 'follower' = 'creator') {
  return User.create({
    email,
    passwordHash: await hashPassword('oldpassword'),
    displayName: email.split('@')[0]!,
    appRole,
  });
}

function tokenFromResetLink(resetLink: string): string {
  const u = new URL(resetLink, 'http://localhost');
  const token = u.searchParams.get('token');
  if (!token) throw new Error('missing token');
  return token;
}

describe('createAdminPasswordResetLink', () => {
  it('replaces any existing token for the user', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const target = await makeUser('target@test.com');

    const { resetLink: first } = await createAdminPasswordResetLink(String(target._id), String(admin._id));
    const { resetLink: second } = await createAdminPasswordResetLink(String(target._id), String(admin._id));

    const t1 = tokenFromResetLink(first);
    const t2 = tokenFromResetLink(second);
    expect(t1).not.toBe(t2);

    await expect(validateAdminPasswordResetToken(t1)).rejects.toMatchObject({ status: 410 });
    await expect(validateAdminPasswordResetToken(t2)).resolves.toEqual({ email: 'target@test.com' });
  });
});

describe('validateAdminPasswordResetToken', () => {
  it('returns email for a valid token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const target = await makeUser('target@test.com');
    const { resetLink } = await createAdminPasswordResetLink(String(target._id), String(admin._id));
    const raw = tokenFromResetLink(resetLink);
    await expect(validateAdminPasswordResetToken(raw)).resolves.toEqual({ email: 'target@test.com' });
  });
});

describe('completeAdminPasswordReset', () => {
  it('updates password, removes sessions, and consumes the token', async () => {
    const admin = await makeUser('admin@test.com', 'admin');
    const target = await makeUser('target@test.com');
    const { resetLink } = await createAdminPasswordResetLink(String(target._id), String(admin._id));
    const raw = tokenFromResetLink(resetLink);

    const rt = generateRefreshToken();
    await Session.create({
      tokenHash: hashToken(rt),
      userId: target._id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    await completeAdminPasswordReset(raw, 'newpassword123');

    const u = await User.findById(target._id);
    expect(await verifyPassword('newpassword123', u!.passwordHash)).toBe(true);
    expect(await verifyPassword('oldpassword', u!.passwordHash)).toBe(false);

    expect(await Session.countDocuments({ userId: target._id })).toBe(0);
    expect(await AdminPasswordResetToken.countDocuments()).toBe(0);

    await expect(completeAdminPasswordReset(raw, 'anotherpass12')).rejects.toMatchObject({ status: 410 });
  });
});
