import mongoose from 'mongoose';
import type { Reaction, ReactionEmoji } from '@travel-journal/shared';

import { Entry as EntryModel } from '../models/Entry.model.js';

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Toggles a reaction emoji for a user on an entry.
 * - If the user has not reacted with this emoji: adds the reaction.
 * - If the user has already reacted with this emoji: removes it.
 * Returns the updated reactions array.
 */
export async function toggleReaction(
  tripId: string,
  entryId: string,
  userId: string,
  emoji: ReactionEmoji,
): Promise<Reaction[]> {
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    throw createHttpError('Entry not found', 404, 'NOT_FOUND');
  }

  const doc = await EntryModel.findOne({
    _id: new mongoose.Types.ObjectId(entryId),
    tripId: new mongoose.Types.ObjectId(tripId),
    deletedAt: null,
  });

  if (!doc) throw createHttpError('Entry not found', 404, 'NOT_FOUND');

  const userIdObj = new mongoose.Types.ObjectId(userId);
  const existingIndex = doc.reactions.findIndex(
    (r) => r.emoji === emoji && String(r.userId) === userId,
  );

  if (existingIndex >= 0) {
    // Toggle off — remove
    doc.reactions.splice(existingIndex, 1);
  } else {
    // Add reaction
    doc.reactions.push({ emoji, userId: userIdObj, createdAt: new Date() });
  }

  await doc.save();

  return doc.reactions.map((r) => ({
    emoji: r.emoji,
    userId: String(r.userId),
    createdAt: r.createdAt.toISOString(),
  }));
}
