import mongoose, { Document, Schema, Types } from 'mongoose';
import type { NotificationData, NotificationType } from '@travel-journal/shared';

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  data: NotificationData;
  readAt: Date | null;
  dismissedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    readAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, dismissedAt: 1, createdAt: -1 });
// Soft-deleted rows self-clean after 7 days.
notificationSchema.index({ dismissedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
