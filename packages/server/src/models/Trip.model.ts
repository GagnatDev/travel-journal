import mongoose, { Document, Schema, Types } from 'mongoose';
import type { TripEntryNotificationMode } from '@travel-journal/shared';

export interface ITripMember {
  userId: Types.ObjectId;
  tripRole: 'creator' | 'contributor' | 'follower';
  addedAt: Date;
  notificationPreferences: {
    /**
     * How this member hears about new entries in the trip.
     *
     * Legacy documents only have `newEntriesPushEnabled`; callers should read
     * the mode via `readTripMemberEntryMode()` which falls back to the legacy
     * field (`false → 'off'`, otherwise `'per_entry'`) when `newEntriesMode`
     * is absent. New writes always set `newEntriesMode`.
     */
    newEntriesMode?: TripEntryNotificationMode;
    /** @deprecated use `newEntriesMode`. Kept only for back-compat on reads. */
    newEntriesPushEnabled?: boolean;
  };
}

export interface ITrip extends Document {
  name: string;
  description?: string;
  departureDate?: Date;
  returnDate?: Date;
  status: 'planned' | 'active' | 'completed';
  createdBy: Types.ObjectId;
  /** When true, contributors may add members / create trip invites. */
  allowContributorInvites: boolean;
  members: ITripMember[];
  coverImageKey?: string;
  photobookPdfJob?: {
    status: 'idle' | 'pending' | 'ready' | 'failed';
    pdfStorageKey?: string;
    finishedAt?: Date;
    errorMessage?: string;
    localeKey?: string;
    timeZone?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const tripMemberSchema = new Schema<ITripMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tripRole: { type: String, enum: ['creator', 'contributor', 'follower'], required: true },
    addedAt: { type: Date, default: () => new Date() },
    notificationPreferences: {
      // No schema default: hydration defaults would defeat the legacy
      // newEntriesPushEnabled → mode fallback in `readTripMemberEntryMode`.
      // Callers (createTrip / addTripMember / invite acceptance) set it explicitly.
      newEntriesMode: {
        type: String,
        enum: ['off', 'per_entry', 'daily_digest'],
      },
      newEntriesPushEnabled: { type: Boolean },
    },
  },
  { _id: false },
);

const tripSchema = new Schema<ITrip>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    departureDate: { type: Date },
    returnDate: { type: Date },
    status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    allowContributorInvites: { type: Boolean, default: false },
    members: [tripMemberSchema],
    coverImageKey: { type: String },
    photobookPdfJob: {
      status: { type: String, enum: ['idle', 'pending', 'ready', 'failed'] },
      pdfStorageKey: { type: String },
      finishedAt: { type: Date },
      errorMessage: { type: String },
      localeKey: { type: String },
      timeZone: { type: String },
    },
  },
  { timestamps: true },
);

tripSchema.index({ createdBy: 1 });
tripSchema.index({ 'members.userId': 1 });
tripSchema.index({ status: 1 });

export const Trip = mongoose.model<ITrip>('Trip', tripSchema);

/**
 * Resolve a trip member's effective entry-notification mode, honouring legacy
 * documents that only have `newEntriesPushEnabled`. `false` maps to `'off'`
 * and anything else (including missing) maps to `'per_entry'`.
 */
export function readTripMemberEntryMode(
  prefs: ITripMember['notificationPreferences'] | undefined,
): TripEntryNotificationMode {
  if (prefs?.newEntriesMode) return prefs.newEntriesMode;
  if (prefs?.newEntriesPushEnabled === false) return 'off';
  return 'per_entry';
}
