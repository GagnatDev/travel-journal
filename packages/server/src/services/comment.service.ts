import mongoose from 'mongoose';
import type { Comment } from '@travel-journal/shared';

import { Comment as CommentModel } from '../models/Comment.model.js';
import { User } from '../models/User.model.js';
import { getEntryById } from './entry.service.js';

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

async function toComment(doc: InstanceType<typeof CommentModel>): Promise<Comment> {
  const author = await User.findById(doc.authorId).lean();
  const authorName = (author?.displayName as string | undefined) ?? '';

  return {
    id: String(doc._id),
    entryId: String(doc.entryId),
    tripId: String(doc.tripId),
    authorId: String(doc.authorId),
    authorName,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function addComment(
  tripId: string,
  entryId: string,
  authorId: string,
  content: string,
): Promise<Comment> {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw createHttpError('Content is required', 400, 'VALIDATION_ERROR');
  }
  if (content.length > 1000) {
    throw createHttpError('Comment must be 1000 characters or fewer', 400, 'VALIDATION_ERROR');
  }

  await getEntryById(tripId, entryId);

  const doc = await CommentModel.create({
    entryId: new mongoose.Types.ObjectId(entryId),
    tripId: new mongoose.Types.ObjectId(tripId),
    authorId: new mongoose.Types.ObjectId(authorId),
    content: content.trim(),
    deletedAt: null,
  });

  return toComment(doc);
}

export async function listComments(entryId: string): Promise<Comment[]> {
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    return [];
  }

  const docs = await CommentModel.find({
    entryId: new mongoose.Types.ObjectId(entryId),
    deletedAt: null,
  }).sort({ createdAt: 1 });

  return Promise.all(docs.map(toComment));
}

export async function deleteComment(commentId: string, requesterId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    throw createHttpError('Comment not found', 404, 'NOT_FOUND');
  }

  const doc = await CommentModel.findOne({
    _id: new mongoose.Types.ObjectId(commentId),
    deletedAt: null,
  });

  if (!doc) throw createHttpError('Comment not found', 404, 'NOT_FOUND');

  if (String(doc.authorId) !== requesterId) {
    throw createHttpError('Forbidden', 403, 'FORBIDDEN');
  }

  doc.deletedAt = new Date();
  await doc.save();
}
