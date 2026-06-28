import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISession extends Document {
  tokenHash: string;
  /**
   * The token hash that was current immediately before the most recent
   * rotation. Accepted for a short grace window so a refresh whose response was
   * lost to a flaky connection can be safely retried, and concurrent refreshes
   * (e.g. multiple tabs) don't kick the user out. See `rotatedAt`.
   */
  previousTokenHash?: string;
  /** When `tokenHash` was last rotated; bounds the `previousTokenHash` grace window. */
  rotatedAt?: Date;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String },
    rotatedAt: { type: Date },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ previousTokenHash: 1 }, { sparse: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model<ISession>('Session', sessionSchema);
