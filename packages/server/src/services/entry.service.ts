import mongoose from 'mongoose';
import type { CreateEntryRequest, Entry, EntryImage, UpdateEntryRequest } from '@travel-journal/shared';

import { Entry as EntryModel, IEntry } from '../models/Entry.model.js';
import { User } from '../models/User.model.js';

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
    images: doc.images.map((img) => ({
      key: img.key,
      width: img.width,
      height: img.height,
      order: img.order,
      uploadedAt: img.uploadedAt.toISOString(),
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

export async function createEntry(
  tripId: string,
  authorId: string,
  data: CreateEntryRequest,
): Promise<Entry> {
  const normalizedImages = data.images ? normalizeImageOrder(data.images) : [];

  const doc = await EntryModel.create({
    tripId: new mongoose.Types.ObjectId(tripId),
    authorId: new mongoose.Types.ObjectId(authorId),
    title: data.title.trim(),
    content: data.content,
    images: normalizedImages.map((img) => ({
      ...img,
      uploadedAt: new Date(img.uploadedAt),
    })),
    location: data.location,
    deletedAt: null,
  });

  return toEntry(doc);
}

export async function listEntries(
  tripId: string,
  page: number,
  limit: number,
): Promise<{ entries: Entry[]; total: number }> {
  const filter = { tripId: new mongoose.Types.ObjectId(tripId), deletedAt: null };

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

export async function getEntryById(tripId: string, entryId: string): Promise<Entry> {
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    throw createHttpError('Entry not found', 404, 'NOT_FOUND');
  }

  const doc = await EntryModel.findOne({
    _id: new mongoose.Types.ObjectId(entryId),
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
  });

  if (!doc) throw createHttpError('Entry not found', 404, 'NOT_FOUND');

  return toEntry(doc);
}

export async function updateEntry(
  tripId: string,
  entryId: string,
  requesterId: string,
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

  const entry = await toEntry(doc);
  assertEntryAuthor(entry, requesterId);

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

  doc.syncVersion += 1;
  await doc.save();

  return toEntry(doc);
}

export async function softDeleteEntry(
  tripId: string,
  entryId: string,
  requesterId: string,
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

  const entry = await toEntry(doc);
  assertEntryAuthor(entry, requesterId);

  doc.deletedAt = new Date();
  await doc.save();
}
