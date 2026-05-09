import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISavedLocation extends Document {
  tripId: Types.ObjectId;
  userId: Types.ObjectId;
  lat: number;
  lng: number;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

const savedLocationSchema = new Schema<ISavedLocation>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    name: { type: String },
  },
  { timestamps: true },
);

savedLocationSchema.index({ tripId: 1, createdAt: -1 });

export const SavedLocation = mongoose.model<ISavedLocation>('SavedLocation', savedLocationSchema);
