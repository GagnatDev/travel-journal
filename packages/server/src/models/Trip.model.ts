import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITripMember {
  userId: Types.ObjectId;
  tripRole: 'creator' | 'contributor' | 'follower';
  addedAt: Date;
}

export interface ITrip extends Document {
  name: string;
  description?: string;
  departureDate?: Date;
  returnDate?: Date;
  status: 'planned' | 'active' | 'completed';
  createdBy: Types.ObjectId;
  members: ITripMember[];
  coverImageKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tripMemberSchema = new Schema<ITripMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tripRole: { type: String, enum: ['creator', 'contributor', 'follower'], required: true },
    addedAt: { type: Date, default: () => new Date() },
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
    members: [tripMemberSchema],
    coverImageKey: { type: String },
  },
  { timestamps: true },
);

tripSchema.index({ createdBy: 1 });
tripSchema.index({ 'members.userId': 1 });
tripSchema.index({ status: 1 });

export const Trip = mongoose.model<ITrip>('Trip', tripSchema);
