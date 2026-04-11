import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  appRole: 'admin' | 'creator' | 'follower';
  preferredLocale: 'nb' | 'en';
  avatarKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    appRole: { type: String, enum: ['admin', 'creator', 'follower'], required: true },
    preferredLocale: { type: String, enum: ['nb', 'en'], default: 'nb' },
    avatarKey: { type: String },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', userSchema);
