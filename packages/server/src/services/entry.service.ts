import mongoose from 'mongoose';
import type {
  CreateEntryRequest,
  Entry,
  EntryImage,
  EntryPublicationStatus,
  TripRole,
  UpdateEntryRequest,
} from '@travel-journal/shared';

import { Entry as EntryModel, IEntry } from '../models/Entry.model.js';
import { logger } from '../logger.js';
import { User } from '../models/User.model.js';

import { dispatchNewEntryNotification } from './notification.service.js';

function entryIsPublished(doc: Pick<IEntry, 'publicationStatus'>): boolean {
  return doc.publicationStatus !== 'draft';
}

/** Resolves an entry for a member; followers cannot see drafts (returns null). */
export async function findEntryDocumentForTripMember(
  tripId: string,
  entryId: string,
  tripRole: TripRole,
): Promise<IEntry | null> {
  if (!mongoose.Types.ObjectId.isValid(entryId)) return null;
  const doc = await EntryModel.findOne({
    _id: new mongoose.Types.ObjectId(entryId),
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
  });
  if (!doc) return null;
  if (tripRole === 'follower' && !entryIsPublished(doc)) return null;
  return doc;
}

function parseCreatePublicationStatus(input: unknown): EntryPublicationStatus {
  if (input === undefined || input === null) return 'published';
  if (input === 'draft' || input === 'published') return input;
  throw createHttpError('Invalid publicationStatus', 400, 'VALIDATION_ERROR');
}

export interface EntryLocationPin {
  entryId: string;
  title: string;
  lat: number;
  lng: number;
  name?: string;
  createdAt: string;
}

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

async function toEntry(doc: IEntry): Promise<Entry> {
  const author = await User.findById(doc.authorId).lean();
  const authorName = (author?.displayName as string | undefined) ?? '';

  const entry: Entry = {
    id: String(doc._id),
    tripId: String(doc.tripId),
    authorId: String(doc.authorId),
    authorName,
    title: doc.title,
    content: doc.content,
    ...(doc.publicationStatus === 'draft' && { publicationStatus: 'draft' as const }),
    images: doc.images.map((img) => ({
      key: img.key,
      ...(img.thumbnailKey !== undefined && { thumbnailKey: img.thumbnailKey }),
      width: img.width,
      height: img.height,
      order: img.order,
      uploadedAt: img.uploadedAt.toISOString(),
    })),
    reactions: (doc.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      userId: String(r.userId),
      createdAt: r.createdAt.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  if (doc.location) {
    entry.location = {
      lat: doc.location.lat,
      lng: doc.location.lng,
      ...(doc.location.name !== undefined && { name: doc.location.name }),
    };
  }

  return entry;
}

export function normalizeImageOrder(images: EntryImage[]): EntryImage[] {
  return [...images]
    .sort((a, b) => a.order - b.order)
    .map((img, i) => ({ ...img, order: i }));
}

export function assertEntryAuthor(entry: Entry, userId: string): void {
  if (entry.authorId !== userId) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
}

/** Trip creator and contributors may edit or delete any entry on the trip; followers may not. */
export function assertCanManageTripEntry(tripRole: TripRole): void {
  if (tripRole === 'follower') {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }
}

/** Parses client-supplied creation time for offline sync; returns null if invalid or out of range. */
export function tryParseClientCreatedAt(input: string): Date | null {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const maxFuture = now + 5 * 60 * 1000;
  const minPast = now - 365 * 24 * 60 * 60 * 1000;
  if (d.getTime() > maxFuture || d.getTime() < minPast) return null;
  return d;
}

export async function createEntry(
  tripId: string,
  authorId: string,
  data: CreateEntryRequest,
): Promise<Entry> {
  const { clientCreatedAt: clientCreatedAtRaw, publicationStatus: publicationStatusRaw, ...rest } =
    data;
  const publicationStatus = parseCreatePublicationStatus(publicationStatusRaw);
  const normalizedImages = rest.images ? normalizeImageOrder(rest.images) : [];

  const now = new Date();
  let createdAt: Date | undefined;
  if (clientCreatedAtRaw !== undefined && clientCreatedAtRaw !== null && String(clientCreatedAtRaw).trim() !== '') {
    const parsed = tryParseClientCreatedAt(String(clientCreatedAtRaw).trim());
    if (!parsed) {
      throw createHttpError('Invalid clientCreatedAt', 400, 'VALIDATION_ERROR');
    }
    createdAt = parsed;
  }

  const doc = await EntryModel.create({
    tripId: new mongoose.Types.ObjectId(tripId),
    authorId: new mongoose.Types.ObjectId(authorId),
    title: rest.title.trim(),
    content: rest.content,
    publicationStatus,
    images: normalizedImages.map((img) => ({
      ...img,
      uploadedAt: new Date(img.uploadedAt),
    })),
    location: rest.location,
    deletedAt: null,
    ...(createdAt !== undefined && { createdAt, updatedAt: now }),
  });

  const entry = await toEntry(doc);
  if (publicationStatus === 'published') {
    void dispatchNewEntryNotification(entry).catch((err: unknown) => {
      logger.warn({ err, entryId: entry.id }, 'Failed to dispatch new-entry notifications');
    });
  }
  return entry;
}

export async function listEntries(
  tripId: string,
  page: number,
  limit: number,
  tripRole: TripRole,
): Promise<{ entries: Entry[]; total: number }> {
  const filter: Record<string, unknown> = {
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
  };
  if (tripRole === 'follower') {
    filter['publicationStatus'] = { $ne: 'draft' };
  }

  const [docs, total] = await Promise.all([
    EntryModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    EntryModel.countDocuments(filter),
  ]);

  const entries = await Promise.all(docs.map(toEntry));
  return { entries, total };
}

export async function getEntryById(
  tripId: string,
  entryId: string,
  tripRole: TripRole,
): Promise<Entry> {
  const doc = await findEntryDocumentForTripMember(tripId, entryId, tripRole);
  if (!doc) throw createHttpError('Entry not found', 404, 'NOT_FOUND');
  return toEntry(doc);
}

export async function updateEntry(
  tripId: string,
  entryId: string,
  tripRole: TripRole,
  data: UpdateEntryRequest,
): Promise<Entry> {
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    throw createHttpError('Entry not found', 404, 'NOT_FOUND');
  }

  const doc = await EntryModel.findOne({
    _id: new mongoose.Types.ObjectId(entryId),
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
  });

  if (!doc) throw createHttpError('Entry not found', 404, 'NOT_FOUND');

  assertCanManageTripEntry(tripRole);

  const wasDraft = doc.publicationStatus === 'draft';

  if (data.title !== undefined) doc.title = data.title.trim();
  if (data.content !== undefined) doc.content = data.content;
  if (data.images !== undefined) {
    const normalized = normalizeImageOrder(data.images);
    doc.images = normalized.map((img) => ({
      ...img,
      uploadedAt: new Date(img.uploadedAt),
    }));
  }
  if (data.location !== undefined) {
    if (data.location === null) {
      doc.set('location', undefined);
    } else {
      doc.location = data.location;
    }
  }
  if (data.publicationStatus !== undefined) {
    if (data.publicationStatus !== 'published') {
      throw createHttpError('Invalid publicationStatus', 400, 'VALIDATION_ERROR');
    }
    doc.publicationStatus = 'published';
  }

  doc.syncVersion += 1;
  await doc.save();

  const entry = await toEntry(doc);
  if (wasDraft && doc.publicationStatus === 'published') {
    void dispatchNewEntryNotification(entry).catch((err: unknown) => {
      logger.warn({ err, entryId: entry.id }, 'Failed to dispatch new-entry notifications');
    });
  }
  return entry;
}

export async function listEntryLocations(
  tripId: string,
  tripRole: TripRole,
): Promise<EntryLocationPin[]> {
  const filter: Record<string, unknown> = {
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
    location: { $exists: true },
  };
  if (tripRole === 'follower') {
    filter['publicationStatus'] = { $ne: 'draft' };
  }

  const docs = await EntryModel.find(filter)
    .select('_id title location createdAt')
    .sort({ createdAt: -1 })
    .lean();

  return docs
    .filter((doc) => doc.location)
    .map((doc) => ({
      entryId: String(doc._id),
      title: doc.title,
      lat: doc.location!.lat,
      lng: doc.location!.lng,
      ...(doc.location!.name !== undefined && { name: doc.location!.name }),
      createdAt: doc.createdAt.toISOString(),
    }));
}

export async function softDeleteEntry(
  tripId: string,
  entryId: string,
  tripRole: TripRole,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    throw createHttpError('Entry not found', 404, 'NOT_FOUND');
  }

  const doc = await EntryModel.findOne({
    _id: new mongoose.Types.ObjectId(entryId),
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
  });

  if (!doc) throw createHttpError('Entry not found', 404, 'NOT_FOUND');

  assertCanManageTripEntry(tripRole);

  doc.deletedAt = new Date();
  await doc.save();
}
