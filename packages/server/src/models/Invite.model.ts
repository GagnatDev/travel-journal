import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IInvite extends Document {
  type: 'platform' | 'trip';
  email: string;
  assignedAppRole: 'creator' | 'follower';
  tripId?: Types.ObjectId;
  tripRole?: 'contributor' | 'follower';
  tokenHash: string;
  /** AES-GCM ciphertext of raw token so invite links can be shown again until expiry (optional on legacy docs). */
  encryptedInviteToken?: string;
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    type: { type: String, enum: ['platform', 'trip'], required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    assignedAppRole: { type: String, enum: ['creator', 'follower'], required: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip' },
    tripRole: { type: String, enum: ['contributor', 'follower'] },
    tokenHash: { type: String, required: true },
    encryptedInviteToken: { type: String },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

inviteSchema.index({ tokenHash: 1 }, { unique: true });
inviteSchema.index({ email: 1, status: 1 });
inviteSchema.index({ tripId: 1, status: 1 });
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = mongoose.model<IInvite>('Invite', inviteSchema);
