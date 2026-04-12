import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IComment extends Document {
  entryId: Types.ObjectId;
  tripId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    entryId: { type: Schema.Types.ObjectId, ref: 'Entry', required: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

commentSchema.index({ entryId: 1, deletedAt: 1, createdAt: 1 });
commentSchema.index({ tripId: 1 });
commentSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2592000 });

export const Comment = mongoose.model<IComment>('Comment', commentSchema);
