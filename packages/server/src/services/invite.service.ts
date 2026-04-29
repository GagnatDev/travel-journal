import crypto from 'node:crypto';

import mongoose from 'mongoose';
import type { Invite, PublicUser, TripMemberInviteSuggestion } from '@travel-journal/shared';

import { IInvite, Invite as InviteModel } from '../models/Invite.model.js';
import { Trip } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { generateAccessToken, hashPassword, hashToken } from './auth.service.js';
import { dispatchTripMemberAddedNotification } from './notification.service.js';

const INVITE_EXPIRY_DAYS = 7;

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

function toInvite(doc: IInvite): Invite {
  const invite: Invite = {
    id: String(doc._id),
    type: doc.type,
    email: doc.email,
    assignedAppRole: doc.assignedAppRole,
    status: doc.status,
    invitedBy: String(doc.invitedBy),
    expiresAt: doc.expiresAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
  if (doc.tripId) invite.tripId = String(doc.tripId);
  if (doc.tripRole) invite.tripRole = doc.tripRole;
  return invite;
}

function toPublicUser(user: {
  _id: unknown;
  email: string;
  displayName: string;
  appRole: string;
  preferredLocale: string;
}): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    appRole: user.appRole as PublicUser['appRole'],
    preferredLocale: user.preferredLocale as PublicUser['preferredLocale'],
  };
}

function inviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createPlatformInvite(
  email: string,
  assignedAppRole: 'creator' | 'follower',
  issuedBy: string,
): Promise<{ invite: Invite; rawToken: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const doc = await InviteModel.create({
    type: 'platform',
    email: email.toLowerCase().trim(),
    assignedAppRole,
    tokenHash,
    invitedBy: new mongoose.Types.ObjectId(issuedBy),
    expiresAt: inviteExpiresAt(),
  });

  return { invite: toInvite(doc), rawToken };
}

export async function createTripInvite(
  tripId: string,
  email: string,
  tripRole: 'contributor' | 'follower',
  issuedBy: string,
): Promise<{ invite: Invite; rawToken: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const doc = await InviteModel.create({
    type: 'trip',
    email: email.toLowerCase().trim(),
    assignedAppRole: 'follower',
    tripId: new mongoose.Types.ObjectId(tripId),
    tripRole,
    tokenHash,
    invitedBy: new mongoose.Types.ObjectId(issuedBy),
    expiresAt: inviteExpiresAt(),
  });

  return { invite: toInvite(doc), rawToken };
}

export async function validateInviteToken(rawToken: string): Promise<Invite> {
  const tokenHash = hashToken(rawToken);
  const doc = await InviteModel.findOne({ tokenHash });

  if (!doc || doc.status !== 'pending' || doc.expiresAt < new Date()) {
    throw createHttpError('Invite has expired or already been used', 410, 'INVITE_GONE');
  }

  return toInvite(doc);
}

export async function acceptInvite(
  rawToken: string,
  displayName: string,
  password: string,
): Promise<{ user: PublicUser; accessToken: string; userId: string }> {
  const tokenHash = hashToken(rawToken);
  const doc = await InviteModel.findOne({ tokenHash });

  if (!doc || doc.status !== 'pending' || doc.expiresAt < new Date()) {
    throw createHttpError('Invite has expired or already been used', 410, 'INVITE_GONE');
  }

  const existing = await User.findOne({ email: doc.email });
  if (existing) {
    throw createHttpError('Email already registered', 409, 'EMAIL_CONFLICT');
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email: doc.email,
    passwordHash,
    displayName: displayName.trim(),
    appRole: doc.assignedAppRole,
  });

  const userId = String(user._id);

  if (doc.type === 'trip' && doc.tripId && doc.tripRole) {
    await Trip.updateOne(
      { _id: doc.tripId },
      {
        $push: {
          members: {
            userId: user._id,
            tripRole: doc.tripRole,
            addedAt: new Date(),
            notificationPreferences: {
              newEntriesMode: 'per_entry',
            },
          },
        },
      },
    );
  }

  doc.status = 'accepted';
  await doc.save();

  const accessToken = generateAccessToken({ userId, email: user.email, appRole: user.appRole });

  if (doc.type === 'trip' && doc.tripId && doc.tripRole) {
    const tripLean = await Trip.findById(doc.tripId).select(['name', 'members']).lean();
    if (tripLean && typeof tripLean.name === 'string') {
      const inviter = await User.findById(doc.invitedBy).select(['displayName']).lean();
      const inviterName = (inviter?.displayName as string | undefined)?.trim() || '';
      await dispatchTripMemberAddedNotification({
        recipientUserId: userId,
        tripId: String(doc.tripId),
        tripName: tripLean.name,
        tripRole: doc.tripRole,
        addedByUserId: String(doc.invitedBy),
        addedByDisplayName: inviterName,
      });
    }
  }

  return { user: toPublicUser(user), accessToken, userId };
}

export async function revokeInvite(inviteId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(inviteId)) {
    throw createHttpError('Invite not found', 404, 'NOT_FOUND');
  }
  const doc = await InviteModel.findById(inviteId);
  if (!doc) throw createHttpError('Invite not found', 404, 'NOT_FOUND');
  if (doc.status === 'accepted') {
    throw createHttpError('Cannot revoke an accepted invite', 400, 'VALIDATION_ERROR');
  }
  doc.status = 'revoked';
  await doc.save();
}

export async function listPlatformInvites(status?: string): Promise<Invite[]> {
  const query: Record<string, unknown> = { type: 'platform' };
  if (status) query['status'] = status;
  const docs = await InviteModel.find(query).sort({ createdAt: -1 });
  return docs.map(toInvite);
}

export async function listTripInvites(tripId: string): Promise<Invite[]> {
  if (!mongoose.Types.ObjectId.isValid(tripId)) return [];
  const docs = await InviteModel.find({
    tripId: new mongoose.Types.ObjectId(tripId),
    status: 'pending',
  }).sort({ createdAt: -1 });
  return docs.map(toInvite);
}

/**
 * Users the trip creator may pick from when inviting: contributors/followers (and other
 * trip creators when relevant) from their other trips, plus creators/contributors of
 * trips they follow.
 */
export async function listTripMemberInviteSuggestions(
  tripId: string,
  creatorUserId: string,
): Promise<TripMemberInviteSuggestion[]> {
  if (!mongoose.Types.ObjectId.isValid(tripId) || !mongoose.Types.ObjectId.isValid(creatorUserId)) {
    return [];
  }

  const oidTrip = new mongoose.Types.ObjectId(tripId);
  const oidCreator = new mongoose.Types.ObjectId(creatorUserId);

  const currentTrip = await Trip.findById(oidTrip).lean();
  if (!currentTrip) return [];

  const currentMemberIds = new Set(currentTrip.members.map((m) => String(m.userId)));

  const relatedTrips = await Trip.find({ 'members.userId': oidCreator }).lean();

  const suggestedUserIds = new Set<string>();

  for (const trip of relatedTrips) {
    const me = trip.members.find((m) => String(m.userId) === creatorUserId);
    if (!me) continue;

    const createdByStr = String(trip.createdBy);

    if (me.tripRole === 'follower') {
      suggestedUserIds.add(createdByStr);
      for (const m of trip.members) {
        if (m.tripRole === 'contributor') suggestedUserIds.add(String(m.userId));
      }
    } else if (me.tripRole === 'creator') {
      for (const m of trip.members) {
        if (String(m.userId) === creatorUserId) continue;
        if (m.tripRole === 'contributor' || m.tripRole === 'follower') {
          suggestedUserIds.add(String(m.userId));
        }
      }
    } else if (me.tripRole === 'contributor') {
      suggestedUserIds.add(createdByStr);
      for (const m of trip.members) {
        if (String(m.userId) === creatorUserId) continue;
        if (m.tripRole === 'contributor' || m.tripRole === 'follower') {
          suggestedUserIds.add(String(m.userId));
        }
      }
    }
  }

  suggestedUserIds.delete(creatorUserId);
  for (const id of currentMemberIds) suggestedUserIds.delete(id);

  if (suggestedUserIds.size === 0) return [];

  const oids = [...suggestedUserIds].map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: oids } })
    .select(['email', 'displayName'])
    .lean();

  const out: TripMemberInviteSuggestion[] = users.map((u) => ({
    userId: String(u._id),
    displayName: u.displayName as string,
    email: u.email as string,
  }));

  out.sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
  });

  return out;
}

export async function addTripMember(
  tripId: string,
  emailOrNickname: string,
  tripRole: 'contributor' | 'follower',
  issuedBy: string,
): Promise<{ type: 'added' } | { type: 'invite_created'; rawToken: string }> {
  const tripDoc = await Trip.findById(new mongoose.Types.ObjectId(tripId)).lean();
  if (!tripDoc) {
    throw createHttpError('Trip not found', 404, 'NOT_FOUND');
  }

  const issuerMember = tripDoc.members.find((m) => String(m.userId) === issuedBy);
  if (!issuerMember) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
  if (issuerMember.tripRole === 'follower') {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
  if (issuerMember.tripRole === 'contributor' && tripDoc.allowContributorInvites !== true) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }

  let user = await User.findOne({ email: emailOrNickname.toLowerCase().trim() });

  if (!user) {
    user = await User.findOne({
      displayName: { $regex: new RegExp(`^${escapeRegex(emailOrNickname)}$`, 'i') },
    });
  }

  if (user) {
    const alreadyMember = await Trip.findOne({
      _id: new mongoose.Types.ObjectId(tripId),
      'members.userId': user._id,
    });
    if (alreadyMember) {
      throw createHttpError('User is already a trip member', 409, 'CONFLICT');
    }

    await Trip.updateOne(
      { _id: new mongoose.Types.ObjectId(tripId) },
      {
        $push: {
          members: {
            userId: user._id,
            tripRole,
            addedAt: new Date(),
            notificationPreferences: {
              newEntriesMode: 'per_entry',
            },
          },
        },
      },
    );
    const issuer = await User.findById(issuedBy).select(['displayName']).lean();
    const issuerName = (issuer?.displayName as string | undefined)?.trim() || '';
    await dispatchTripMemberAddedNotification({
      recipientUserId: String(user._id),
      tripId,
      tripName: tripDoc.name,
      tripRole,
      addedByUserId: issuedBy,
      addedByDisplayName: issuerName,
    });
    return { type: 'added' };
  }

  if (!emailOrNickname.includes('@')) {
    throw createHttpError('User not found', 404, 'NOT_FOUND');
  }

  const { rawToken } = await createTripInvite(tripId, emailOrNickname, tripRole, issuedBy);
  return { type: 'invite_created', rawToken };
}
