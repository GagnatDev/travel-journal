import mongoose from 'mongoose';
import type { CreateTripRequest, Trip, TripStatus, UpdateTripRequest } from '@travel-journal/shared';

import { Trip as TripModel, ITrip, readTripMemberEntryMode } from '../models/Trip.model.js';
import { Entry as EntryModel } from '../models/Entry.model.js';
import { User } from '../models/User.model.js';

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

function normalizeTripDescription(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  return trimmed === '' ? undefined : trimmed;
}

async function toTrip(doc: ITrip): Promise<Trip> {
  const userIds = doc.members.map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u) => [String(u._id), u.displayName as string]));

  const trip: Trip = {
    id: String(doc._id),
    name: doc.name,
    status: doc.status,
    createdBy: String(doc.createdBy),
    allowContributorInvites: doc.allowContributorInvites === true,
    members: doc.members.map((m) => ({
      userId: String(m.userId),
      displayName: userMap.get(String(m.userId)) ?? '',
      tripRole: m.tripRole,
      addedAt: m.addedAt.toISOString(),
      notificationPreferences: {
        newEntriesMode: readTripMemberEntryMode(m.notificationPreferences),
      },
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  if (typeof doc.description === 'string' && doc.description.trim() !== '') {
    trip.description = doc.description.trim();
  }
  if (doc.departureDate !== undefined) trip.departureDate = doc.departureDate.toISOString();
  if (doc.returnDate !== undefined) trip.returnDate = doc.returnDate.toISOString();

  if (typeof doc.coverImageKey === 'string' && doc.coverImageKey.trim() !== '') {
    trip.photobookCoverImageKey = doc.coverImageKey.trim();
  }

  return trip;
}

export function isValidStatusTransition(from: TripStatus, to: TripStatus): boolean {
  if (from === 'planned' && to === 'active') return true;
  if (from === 'active' && to === 'completed') return true;
  if (from === 'completed' && to === 'active') return true;
  return false;
}

export function assertTripCreator(trip: Trip, userId: string): void {
  const member = trip.members.find((m) => m.userId === userId);
  if (!member || member.tripRole !== 'creator') {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
}

export async function createTrip(data: CreateTripRequest, creatorId: string): Promise<Trip> {
  const user = await User.findById(creatorId).lean();
  if (!user) throw createHttpError('User not found', 404, 'NOT_FOUND');

  const doc = await TripModel.create({
    name: data.name.trim(),
    description: normalizeTripDescription(data.description),
    departureDate: data.departureDate ? new Date(data.departureDate) : undefined,
    returnDate: data.returnDate ? new Date(data.returnDate) : undefined,
    createdBy: new mongoose.Types.ObjectId(creatorId),
    members: [
      {
        userId: new mongoose.Types.ObjectId(creatorId),
        tripRole: 'creator',
        addedAt: new Date(),
        notificationPreferences: {
          newEntriesMode: 'per_entry',
        },
      },
    ],
  });

  return toTrip(doc);
}

export async function getTripById(tripId: string): Promise<Trip | null> {
  if (!mongoose.Types.ObjectId.isValid(tripId)) return null;
  const doc = await TripModel.findById(tripId);
  if (!doc) return null;
  return toTrip(doc);
}

export async function listTripsForUser(userId: string): Promise<Trip[]> {
  const docs = await TripModel.find({
    'members.userId': new mongoose.Types.ObjectId(userId),
  });
  return Promise.all(docs.map(toTrip));
}

export async function updateTrip(
  tripId: string,
  data: UpdateTripRequest,
  requesterId: string,
): Promise<Trip> {
  if (!mongoose.Types.ObjectId.isValid(tripId)) {
    throw createHttpError('Trip not found', 404, 'NOT_FOUND');
  }
  const doc = await TripModel.findById(tripId);
  if (!doc) throw createHttpError('Trip not found', 404, 'NOT_FOUND');

  const trip = await toTrip(doc);
  assertTripCreator(trip, requesterId);

  if (data.name !== undefined) doc.name = data.name.trim();
  if (data.description !== undefined) {
    const next = normalizeTripDescription(data.description);
    if (next === undefined) {
      doc.set('description', undefined);
    } else {
      doc.description = next;
    }
  }
  if (data.departureDate !== undefined) {
    if (data.departureDate) {
      doc.departureDate = new Date(data.departureDate);
    } else {
      doc.departureDate = undefined as unknown as Date;
    }
  }
  if (data.returnDate !== undefined) {
    if (data.returnDate) {
      doc.returnDate = new Date(data.returnDate);
    } else {
      doc.returnDate = undefined as unknown as Date;
    }
  }
  if (data.allowContributorInvites !== undefined) {
    doc.allowContributorInvites = data.allowContributorInvites;
  }

  if (data.photobookCoverImageKey !== undefined) {
    if (data.photobookCoverImageKey === null || data.photobookCoverImageKey === '') {
      doc.set('coverImageKey', undefined);
    } else {
      const key = data.photobookCoverImageKey.trim();
      const parts = key.split('/');
      const keyTripId = parts[1];
      if (keyTripId !== tripId) {
        throw createHttpError('Image does not belong to this trip', 400, 'VALIDATION_ERROR');
      }
      const exists = await EntryModel.exists({
        tripId: new mongoose.Types.ObjectId(tripId),
        deletedAt: null,
        'images.key': key,
      });
      if (!exists) {
        throw createHttpError(
          'photobookCoverImageKey must reference an image on a trip entry',
          400,
          'VALIDATION_ERROR',
        );
      }
      doc.set('coverImageKey', key);
    }
  }

  await doc.save();
  return toTrip(doc);
}

export async function updateTripStatus(
  tripId: string,
  newStatus: TripStatus,
  requesterId: string,
): Promise<Trip> {
  if (!mongoose.Types.ObjectId.isValid(tripId)) {
    throw createHttpError('Trip not found', 404, 'NOT_FOUND');
  }
  const doc = await TripModel.findById(tripId);
  if (!doc) throw createHttpError('Trip not found', 404, 'NOT_FOUND');

  const trip = await toTrip(doc);
  assertTripCreator(trip, requesterId);

  if (!isValidStatusTransition(doc.status, newStatus)) {
    throw createHttpError(
      `Invalid status transition: ${doc.status} → ${newStatus}`,
      400,
      'INVALID_TRANSITION',
    );
  }

  doc.status = newStatus;
  await doc.save();
  return toTrip(doc);
}

export async function deleteTrip(
  tripId: string,
  requesterId: string,
  requesterAppRole: string,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(tripId)) {
    throw createHttpError('Trip not found', 404, 'NOT_FOUND');
  }
  const doc = await TripModel.findById(tripId);
  if (!doc) throw createHttpError('Trip not found', 404, 'NOT_FOUND');

  if (requesterAppRole !== 'admin') {
    const trip = await toTrip(doc);
    assertTripCreator(trip, requesterId);

    if (doc.status === 'planned' || doc.status === 'active') {
      throw createHttpError('Cannot delete a planned or active trip', 409, 'CONFLICT');
    }
  }

  await TripModel.deleteOne({ _id: doc._id });
}
