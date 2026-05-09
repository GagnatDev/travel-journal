import mongoose from 'mongoose';
import type { CreateSavedLocationRequest, TripRole } from '@travel-journal/shared';

import { SavedLocation } from '../models/SavedLocation.model.js';
import { User } from '../models/User.model.js';

interface SavedLocationDocFields {
  _id: mongoose.Types.ObjectId;
  tripId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  lat: number;
  lng: number;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

/** Trip creator and contributors may manage saved locations; followers may not. */
export function assertCanManageSavedLocation(tripRole: TripRole): void {
  if (tripRole === 'follower') {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
}

export interface SavedLocationDto {
  id: string;
  tripId: string;
  lat: number;
  lng: number;
  savedByUserId: string;
  savedByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
}

async function enrichWithDisplayNames(docs: SavedLocationDocFields[]): Promise<SavedLocationDto[]> {
  const userIds = [...new Set(docs.map((d) => String(d.userId)))];
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select('_id displayName')
          .lean()
      : [];

  const nameById = new Map<string, string>(
    users.map((u) => [String(u._id), ((u.displayName as string | undefined) ?? '')]),
  );

  return docs.map((doc) => {
    const dto: SavedLocationDto = {
      id: String(doc._id),
      tripId: String(doc.tripId),
      lat: doc.lat,
      lng: doc.lng,
      savedByUserId: String(doc.userId),
      savedByDisplayName: nameById.get(String(doc.userId)) ?? '',
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
    if (doc.name !== undefined && doc.name.trim() !== '') dto.name = doc.name.trim();
    return dto;
  });
}

export async function createSavedLocation(
  tripId: string,
  userId: string,
  data: CreateSavedLocationRequest,
  tripRole: TripRole,
): Promise<SavedLocationDto> {
  assertCanManageSavedLocation(tripRole);

  const { lat, lng, name } = data;
  if (typeof lat !== 'number' || Number.isNaN(lat) || typeof lng !== 'number' || Number.isNaN(lng)) {
    throw createHttpError('lat and lng are required numbers', 400, 'VALIDATION_ERROR');
  }
  const trimmedName =
    typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, 500) : undefined;

  const doc = await SavedLocation.create({
    tripId: new mongoose.Types.ObjectId(tripId),
    userId: new mongoose.Types.ObjectId(userId),
    lat,
    lng,
    ...(trimmedName !== undefined && { name: trimmedName }),
  });

  const [dto] = await enrichWithDisplayNames([doc]);
  return dto!;
}

export async function listSavedLocationsForTrip(tripId: string): Promise<SavedLocationDto[]> {
  const docs = await SavedLocation.find({ tripId: new mongoose.Types.ObjectId(tripId) })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return enrichWithDisplayNames(docs as SavedLocationDocFields[]);
}

export async function deleteSavedLocation(
  tripId: string,
  savedId: string,
  tripRole: TripRole,
): Promise<void> {
  assertCanManageSavedLocation(tripRole);

  if (!mongoose.Types.ObjectId.isValid(savedId)) {
    throw createHttpError('Saved location not found', 404, 'NOT_FOUND');
  }

  const result = await SavedLocation.deleteOne({
    _id: new mongoose.Types.ObjectId(savedId),
    tripId: new mongoose.Types.ObjectId(tripId),
  });

  if (result.deletedCount === 0) {
    throw createHttpError('Saved location not found', 404, 'NOT_FOUND');
  }
}

/** Validates bookmark belongs to trip and returns its timestamps for entry creation. */
export async function requireConsumableSavedLocation(
  tripId: string,
  savedLocationId: string,
): Promise<{ createdAt: Date }> {
  const found = await SavedLocation.findOne({
    _id: new mongoose.Types.ObjectId(savedLocationId),
    tripId: new mongoose.Types.ObjectId(tripId),
  })
    .select('createdAt')
    .lean();

  if (!found || found.createdAt === undefined) {
    throw createHttpError('Saved location not found', 400, 'VALIDATION_ERROR');
  }

  return { createdAt: found.createdAt as Date };
}

/** Removes bookmark after entry create (standalone Mongo-compatible; avoids multi-document transactions). */
export async function finalizeConsumedSavedLocation(tripId: string, savedLocationId: string): Promise<void> {
  await SavedLocation.deleteOne({
    _id: new mongoose.Types.ObjectId(savedLocationId),
    tripId: new mongoose.Types.ObjectId(tripId),
  });
}
