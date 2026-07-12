import crypto from 'node:crypto';

import mongoose from 'mongoose';

import { AdminPasswordResetToken } from '../models/AdminPasswordResetToken.model.js';
import { User } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';

import { hashPassword, hashToken } from './auth.service.js';

const RESET_EXPIRY_DAYS = 7;

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

function resetExpiresAt(): Date {
  return new Date(Date.now() + RESET_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

export async function createAdminPasswordResetLink(
  targetUserId: string,
  issuedByUserId: string,
): Promise<{ resetLink: string }> {
  const user = await User.findById(targetUserId);
  if (!user) {
    throw createHttpError('User not found', 404, 'NOT_FOUND');
  }

  await AdminPasswordResetToken.deleteMany({ userId: new mongoose.Types.ObjectId(targetUserId) });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  await AdminPasswordResetToken.create({
    userId: new mongoose.Types.ObjectId(targetUserId),
    tokenHash,
    issuedBy: new mongoose.Types.ObjectId(issuedByUserId),
    expiresAt: resetExpiresAt(),
  });

  const resetLink = `/password-reset?token=${rawToken}`;
  return { resetLink };
}

export type AdminPasswordResetTokenLookup =
  | { kind: 'valid'; email: string }
  | { kind: 'already_completed'; email: string };

export async function lookupAdminPasswordResetToken(
  rawToken: string,
): Promise<AdminPasswordResetTokenLookup> {
  const tokenHash = hashToken(rawToken);
  const doc = await AdminPasswordResetToken.findOne({ tokenHash });

  if (!doc) {
    throw createHttpError('Reset link has expired or already been used', 410, 'RESET_GONE');
  }

  const user = await User.findById(doc.userId).lean();
  if (!user) {
    throw createHttpError('Reset link has expired or already been used', 410, 'RESET_GONE');
  }

  if (doc.usedAt) {
    return { kind: 'already_completed', email: user.email };
  }

  if (doc.expiresAt < new Date()) {
    throw createHttpError('Reset link has expired or already been used', 410, 'RESET_GONE');
  }

  return { kind: 'valid', email: user.email };
}

export async function validateAdminPasswordResetToken(rawToken: string): Promise<{ email: string }> {
  const result = await lookupAdminPasswordResetToken(rawToken);
  if (result.kind === 'already_completed') {
    throw createHttpError('Reset link has expired or already been used', 410, 'RESET_GONE');
  }
  return { email: result.email };
}

export async function completeAdminPasswordReset(rawToken: string, password: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const doc = await AdminPasswordResetToken.findOne({ tokenHash });

  if (!doc || doc.usedAt || doc.expiresAt < new Date()) {
    throw createHttpError('Reset link has expired or already been used', 410, 'RESET_GONE');
  }

  const passwordHash = await hashPassword(password);

  const updated = await User.findOneAndUpdate(
    { _id: doc.userId },
    { passwordHash },
    { new: false },
  );
  if (!updated) {
    await AdminPasswordResetToken.deleteOne({ _id: doc._id });
    throw createHttpError('Reset link has expired or already been used', 410, 'RESET_GONE');
  }

  await Session.deleteMany({ userId: doc.userId });
  doc.usedAt = new Date();
  await doc.save();
}
