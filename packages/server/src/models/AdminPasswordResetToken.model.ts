import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAdminPasswordResetToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  issuedBy: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const adminPasswordResetTokenSchema = new Schema<IAdminPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminPasswordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
adminPasswordResetTokenSchema.index({ userId: 1 });
adminPasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminPasswordResetToken = mongoose.model<IAdminPasswordResetToken>(
  'AdminPasswordResetToken',
  adminPasswordResetTokenSchema,
);
