import mongoose, { Document, Schema, Types } from 'mongoose';
import type {
  PhotobookOrderStatus,
  ProdigiQuote,
  ProdigiShippingMethod,
  ShippingAddress,
} from '@travel-journal/shared';

import { shippingAddressSchema } from './User.model.js';

const ORDER_STATUSES: PhotobookOrderStatus[] = [
  'requested',
  'awaiting_approval',
  'submitting',
  'submitted',
  'failed',
  'rejected',
  'cancelled',
];

/** Statuses for which a new order may NOT be created for the same trip (an order is "open"). */
export const OPEN_ORDER_STATUSES: PhotobookOrderStatus[] = [
  'requested',
  'awaiting_approval',
  'submitting',
  'submitted',
];

export interface IPhotobookOrder extends Document {
  tripId: Types.ObjectId;
  userId: Types.ObjectId;
  status: PhotobookOrderStatus;
  shippingAddress: ShippingAddress;
  shippingMethod: ProdigiShippingMethod;
  copies: number;
  sku?: string;
  pageCount?: number;
  prodigiOrderId?: string;
  prodigiQuote?: ProdigiQuote;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const prodigiCostSchema = new Schema(
  { amount: { type: String }, currency: { type: String } },
  { _id: false },
);

const prodigiQuoteSchema = new Schema<ProdigiQuote>(
  {
    items: { type: prodigiCostSchema },
    shipping: { type: prodigiCostSchema },
    totalCost: { type: prodigiCostSchema },
    fetchedAt: { type: String },
  },
  { _id: false },
);

const photobookOrderSchema = new Schema<IPhotobookOrder>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'requested' },
    shippingAddress: { type: shippingAddressSchema, required: true },
    shippingMethod: { type: String, default: 'Budget' },
    copies: { type: Number, default: 1, min: 1 },
    sku: { type: String },
    pageCount: { type: Number },
    prodigiOrderId: { type: String },
    prodigiQuote: { type: prodigiQuoteSchema },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

photobookOrderSchema.index({ tripId: 1, status: 1 });
photobookOrderSchema.index({ userId: 1 });
photobookOrderSchema.index({ status: 1 });

export const PhotobookOrder = mongoose.model<IPhotobookOrder>(
  'PhotobookOrder',
  photobookOrderSchema,
);
