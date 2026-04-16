import mongoose, { Document, Schema, Types } from 'mongoose';

interface IPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface IPushSubscription extends Document {
  userId: Types.ObjectId;
  endpoint: string;
  keys: IPushSubscriptionKeys;
  deviceLabel?: string;
  disabledAt?: Date;
  lastSuccessAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, trim: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    deviceLabel: { type: String, trim: true },
    disabledAt: { type: Date },
    lastSuccessAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscription = mongoose.model<IPushSubscription>(
  'PushSubscription',
  pushSubscriptionSchema,
);
