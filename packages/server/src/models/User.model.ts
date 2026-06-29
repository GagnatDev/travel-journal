import mongoose, { Document, Schema } from 'mongoose';
import type { ShippingAddress } from '@travel-journal/shared';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  appRole: 'admin' | 'creator' | 'follower';
  preferredLocale: 'nb' | 'en';
  avatarKey?: string;
  /** Admin-controlled gate for ordering a physical photobook. Defaults to false. */
  photobookOrderingEnabled?: boolean;
  /** Saved shipping address for photobook orders. */
  shippingAddress?: ShippingAddress;
  createdAt: Date;
  updatedAt: Date;
}

export const shippingAddressSchema = new Schema<ShippingAddress>(
  {
    recipientName: { type: String, trim: true },
    email: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    townOrCity: { type: String, trim: true },
    stateOrCounty: { type: String, trim: true },
    postalOrZipCode: { type: String, trim: true },
    countryCode: { type: String, trim: true, uppercase: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    appRole: { type: String, enum: ['admin', 'creator', 'follower'], required: true },
    preferredLocale: { type: String, enum: ['nb', 'en'], default: 'nb' },
    avatarKey: { type: String },
    photobookOrderingEnabled: { type: Boolean, default: false },
    shippingAddress: { type: shippingAddressSchema },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', userSchema);
