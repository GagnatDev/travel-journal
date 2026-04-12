import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IEntryImage {
  key: string;
  width: number;
  height: number;
  order: number;
  uploadedAt: Date;
}

export interface IEntryLocation {
  lat: number;
  lng: number;
  name?: string;
}

export type ReactionEmoji = '❤️' | '👍' | '😂';

export interface IReaction {
  emoji: ReactionEmoji;
  userId: Types.ObjectId;
  createdAt: Date;
}

export interface IEntry extends Document {
  tripId: Types.ObjectId;
  authorId: Types.ObjectId;
  title: string;
  content: string;
  images: IEntryImage[];
  location?: IEntryLocation;
  isFavorite: boolean;
  syncVersion: number;
  editHistory?: Array<{ content: string; images: IEntryImage[]; savedAt: Date; savedBy: Types.ObjectId }>;
  promptUsed?: string;
  reactions: IReaction[];
  createdAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
}

const entryImageSchema = new Schema<IEntryImage>(
  {
    key: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    order: { type: Number, required: true },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const entryLocationSchema = new Schema<IEntryLocation>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    name: { type: String },
  },
  { _id: false },
);

const reactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true, enum: ['❤️', '👍', '😂'] },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const entrySchema = new Schema<IEntry>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    images: [entryImageSchema],
    location: { type: entryLocationSchema },
    isFavorite: { type: Boolean, default: false },
    syncVersion: { type: Number, default: 0 },
    promptUsed: { type: String },
    reactions: { type: [reactionSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

entrySchema.index({ tripId: 1, createdAt: -1, deletedAt: 1 });
entrySchema.index({ tripId: 1, authorId: 1 });
entrySchema.index({ authorId: 1 });
entrySchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2592000 });

export const Entry = mongoose.model<IEntry>('Entry', entrySchema);
