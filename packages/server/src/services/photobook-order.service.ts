/**
 * Server-side flow for ordering a physical photobook through Prodigi.
 *
 * Lifecycle: `awaiting_approval → submitting → submitted` (admin-approved) or,
 * when `PHOTOBOOK_ORDER_REQUIRE_APPROVAL=false`, `submitting → submitted`
 * directly. Side states: `failed` (retryable), `rejected` (admin).
 */
import mongoose from 'mongoose';
import type {
  CreatePhotobookOrderRequest,
  NotificationData,
  PhotobookOrder as PhotobookOrderDTO,
  PhotobookOrderStatus,
  ProdigiShippingMethod,
  ShippingAddress,
} from '@travel-journal/shared';

import { logger } from '../logger.js';
import {
  PhotobookOrder,
  OPEN_ORDER_STATUSES,
  type IPhotobookOrder,
} from '../models/PhotobookOrder.model.js';
import { Trip as TripModel, type ITrip } from '../models/Trip.model.js';
import { User, type IUser } from '../models/User.model.js';
import { generateSignedUrl } from './media.service.js';
import { enqueueNotifications, deliverWebPush } from './notification.service.js';
import {
  createProdigiOrder,
  getProdigiQuote,
  type ProdigiOrderParams,
} from './prodigi.service.js';

function createHttpError(message: string, status: number, code: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

// --- Config helpers ---------------------------------------------------------

function requireApproval(): boolean {
  return process.env['PHOTOBOOK_ORDER_REQUIRE_APPROVAL'] !== 'false';
}

function photobookSku(): string {
  // TODO: confirm exact Prodigi hardcover 9x9 SKU via their product/quote API.
  return process.env['PHOTOBOOK_PRODIGI_SKU'] ?? 'BOOK-9X9-HARD';
}

function defaultShippingMethod(): ProdigiShippingMethod {
  return (process.env['PHOTOBOOK_SHIPPING_METHOD'] as ProdigiShippingMethod) ?? 'Budget';
}

// --- Address sanitization ---------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Narrow arbitrary input to a valid {@link ShippingAddress}, or `null` if any
 * required field is missing/blank or the country code is not 2 chars. Used by
 * `user.router.ts` (profile address save) and order creation.
 */
export function sanitizeShippingAddress(input: unknown): ShippingAddress | null {
  if (!isRecord(input)) return null;

  const recipientName = getStr(input, 'recipientName');
  const line1 = getStr(input, 'line1');
  const townOrCity = getStr(input, 'townOrCity');
  const postalOrZipCode = getStr(input, 'postalOrZipCode');
  const countryCodeRaw = getStr(input, 'countryCode');

  if (!recipientName || !line1 || !townOrCity || !postalOrZipCode || !countryCodeRaw) {
    return null;
  }

  const countryCode = countryCodeRaw.toUpperCase();
  if (countryCode.length !== 2) return null;

  const email = getStr(input, 'email');
  const phoneNumber = getStr(input, 'phoneNumber');
  const line2 = getStr(input, 'line2');
  const stateOrCounty = getStr(input, 'stateOrCounty');

  return {
    recipientName,
    line1,
    townOrCity,
    postalOrZipCode,
    countryCode,
    ...(email ? { email } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(line2 ? { line2 } : {}),
    ...(stateOrCounty ? { stateOrCounty } : {}),
  };
}

// --- Entitlement gate -------------------------------------------------------

/**
 * Single policy gate for whether a user may order a photobook for a trip.
 *
 * FUTURE PAYMENT HOOK: when payments are enabled, the entitlement check (or a
 * paid-order check) plugs in here.
 */
function assertCanOrderPhotobook(user: IUser, tripDoc: ITrip): void {
  const isCreator = String(tripDoc.createdBy) === String(user._id);
  if (!isCreator || user.photobookOrderingEnabled !== true) {
    throw createHttpError('Not allowed to order a photobook for this trip', 403, 'FORBIDDEN');
  }
}

// --- Notifications (non-fatal) ----------------------------------------------

async function notify(
  userIds: mongoose.Types.ObjectId[],
  data: NotificationData,
  title: string,
  body: string,
): Promise<void> {
  if (!userIds.length) return;
  try {
    const notificationIdByUser = await enqueueNotifications(userIds, data);
    await deliverWebPush(userIds, { title, body, data, notificationIdByUser });
  } catch (err) {
    logger.warn({ err, type: data.type }, 'Failed to dispatch photobook-order notification');
  }
}

function orderStatusData(
  order: IPhotobookOrder,
  tripDoc: ITrip,
  event: 'awaiting_approval' | 'submitted' | 'failed' | 'rejected',
): NotificationData {
  return {
    type: 'photobook.order_status',
    tripId: String(tripDoc._id),
    tripName: tripDoc.name,
    orderId: String(order._id),
    event,
  };
}

async function notifyAdminsAwaitingApproval(
  order: IPhotobookOrder,
  tripDoc: ITrip,
): Promise<void> {
  const admins = await User.find({ appRole: 'admin' }).select('_id').lean();
  const adminIds = admins.map((a) => new mongoose.Types.ObjectId(String(a._id)));
  await notify(
    adminIds,
    orderStatusData(order, tripDoc, 'awaiting_approval'),
    'Photobook order awaiting approval',
    `A photobook order for "${tripDoc.name}" is awaiting approval.`,
  );
}

async function notifyUser(
  order: IPhotobookOrder,
  tripDoc: ITrip,
  event: 'submitted' | 'failed' | 'rejected',
): Promise<void> {
  const userId = new mongoose.Types.ObjectId(String(order.userId));
  const titles: Record<typeof event, string> = {
    submitted: 'Photobook order submitted',
    failed: 'Photobook order failed',
    rejected: 'Photobook order rejected',
  };
  const bodies: Record<typeof event, string> = {
    submitted: `Your photobook order for "${tripDoc.name}" has been submitted.`,
    failed: `Your photobook order for "${tripDoc.name}" could not be submitted.`,
    rejected: `Your photobook order for "${tripDoc.name}" was rejected.`,
  };
  await notify([userId], orderStatusData(order, tripDoc, event), titles[event], bodies[event]);
}

// --- DTO mapping ------------------------------------------------------------

export function toPhotobookOrderDTO(
  order: IPhotobookOrder,
  extras?: { tripName?: string; userDisplayName?: string },
): PhotobookOrderDTO {
  return {
    id: String(order._id),
    tripId: String(order.tripId),
    userId: String(order.userId),
    status: order.status,
    shippingAddress: order.shippingAddress,
    shippingMethod: order.shippingMethod,
    copies: order.copies,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    ...(order.sku ? { sku: order.sku } : {}),
    ...(order.pageCount !== undefined ? { pageCount: order.pageCount } : {}),
    ...(order.prodigiOrderId ? { prodigiOrderId: order.prodigiOrderId } : {}),
    ...(order.prodigiQuote ? { prodigiQuote: order.prodigiQuote } : {}),
    ...(order.errorMessage ? { errorMessage: order.errorMessage } : {}),
    ...(extras?.tripName ? { tripName: extras.tripName } : {}),
    ...(extras?.userDisplayName ? { userDisplayName: extras.userDisplayName } : {}),
  };
}

// --- Prodigi submission (internal, never throws) ----------------------------

async function loadTripDoc(tripId: mongoose.Types.ObjectId | string): Promise<ITrip | null> {
  return TripModel.findById(tripId);
}

/**
 * Presign the interior/cover/spine PDFs and submit the order to Prodigi.
 * On success → `submitted`, on error → `failed`. Never throws so admin/route
 * handlers always get a clean result; the order doc carries the outcome.
 */
async function submitOrderToProdigi(order: IPhotobookOrder, tripDocIn?: ITrip): Promise<void> {
  const tripDoc = tripDocIn ?? (await loadTripDoc(order.tripId));

  order.status = 'submitting';
  await order.save();

  try {
    const job = tripDoc?.photobookPdfJob;
    const interiorKey = job?.interiorPdfStorageKey;
    const coverKey = job?.coverPdfStorageKey;
    const spineKey = job?.spinePdfStorageKey;
    if (!interiorKey || !coverKey || !spineKey) {
      throw new Error('Photobook PDF assets are no longer available');
    }

    const [interiorUrl, coverUrl, spineUrl] = await Promise.all([
      generateSignedUrl(interiorKey, 3600),
      generateSignedUrl(coverKey, 3600),
      generateSignedUrl(spineKey, 3600),
    ]);

    const address = order.shippingAddress;
    const params: ProdigiOrderParams = {
      idempotencyKey: String(order._id),
      recipient: {
        name: address.recipientName,
        address: {
          line1: address.line1,
          postalOrZipCode: address.postalOrZipCode,
          countryCode: address.countryCode,
          townOrCity: address.townOrCity,
          ...(address.line2 ? { line2: address.line2 } : {}),
          ...(address.stateOrCounty ? { stateOrCounty: address.stateOrCounty } : {}),
        },
        ...(address.email ? { email: address.email } : {}),
        ...(address.phoneNumber ? { phoneNumber: address.phoneNumber } : {}),
      },
      sku: order.sku ?? photobookSku(),
      copies: order.copies,
      interiorUrl,
      coverUrl,
      spineUrl,
      shippingMethod: order.shippingMethod,
      ...(job?.pageCount !== undefined ? { pageCount: job.pageCount } : {}),
    };

    const { prodigiOrderId } = await createProdigiOrder(params);
    order.status = 'submitted';
    order.prodigiOrderId = prodigiOrderId;
    order.set('errorMessage', undefined);
    await order.save();

    if (tripDoc) {
      await notifyUser(order, tripDoc, 'submitted');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    order.status = 'failed';
    order.errorMessage = msg.slice(0, 500);
    await order.save();
    logger.warn({ err, orderId: String(order._id) }, 'Prodigi order submission failed');
    if (tripDoc) {
      await notifyUser(order, tripDoc, 'failed');
    }
  }
}

// --- Public API -------------------------------------------------------------

function clampCopies(copies: number | undefined): number {
  return Math.max(1, Math.floor(copies ?? 1));
}

export async function createPhotobookOrder(args: {
  tripId: string;
  userId: string;
  request: CreatePhotobookOrderRequest;
}): Promise<PhotobookOrderDTO> {
  const { tripId, userId, request } = args;

  const [user, tripDoc] = await Promise.all([User.findById(userId), TripModel.findById(tripId)]);
  if (!user) throw createHttpError('User not found', 404, 'NOT_FOUND');
  if (!tripDoc) throw createHttpError('Trip not found', 404, 'NOT_FOUND');

  assertCanOrderPhotobook(user, tripDoc);

  const job = tripDoc.photobookPdfJob;
  const ready =
    job?.status === 'ready' &&
    Boolean(job.interiorPdfStorageKey) &&
    Boolean(job.coverPdfStorageKey) &&
    Boolean(job.spinePdfStorageKey);
  if (!ready) {
    throw createHttpError(
      'The photobook PDF is not ready. Generate it from trip settings first.',
      409,
      'PHOTOBOOK_NOT_READY',
    );
  }

  const sanitized = sanitizeShippingAddress(request.shippingAddress);
  if (!sanitized) {
    throw createHttpError('A complete shipping address is required', 400, 'VALIDATION_ERROR');
  }

  const initialStatus: PhotobookOrderStatus = requireApproval() ? 'awaiting_approval' : 'submitting';
  const tripObjectId = new mongoose.Types.ObjectId(tripId);

  // Atomic dedupe: upsert only if no open order exists for this trip.
  const existing = await PhotobookOrder.findOneAndUpdate(
    { tripId: tripObjectId, status: { $in: OPEN_ORDER_STATUSES } },
    {
      $setOnInsert: {
        tripId: tripObjectId,
        userId: new mongoose.Types.ObjectId(userId),
        status: initialStatus,
        shippingAddress: sanitized,
        shippingMethod: defaultShippingMethod(),
        copies: clampCopies(request.copies),
        sku: photobookSku(),
        ...(job.pageCount !== undefined ? { pageCount: job.pageCount } : {}),
      },
    },
    { upsert: true, new: false, setDefaultsOnInsert: true },
  );

  if (existing) {
    throw createHttpError(
      'An order for this trip is already in progress',
      409,
      'ORDER_ALREADY_OPEN',
    );
  }

  const order = await PhotobookOrder.findOne({
    tripId: tripObjectId,
    status: { $in: OPEN_ORDER_STATUSES },
  });
  if (!order) {
    // Should never happen right after a successful insert.
    throw createHttpError('Failed to create order', 500, 'INTERNAL_ERROR');
  }

  if (request.saveAddressToProfile) {
    await User.findByIdAndUpdate(userId, { shippingAddress: sanitized });
  }

  if (initialStatus === 'submitting') {
    await submitOrderToProdigi(order, tripDoc);
  } else {
    await notifyAdminsAwaitingApproval(order, tripDoc);
  }

  return toPhotobookOrderDTO(order);
}

export async function getUserOrderForTrip(
  tripId: string,
  userId: string,
): Promise<PhotobookOrderDTO | null> {
  const order = await PhotobookOrder.findOne({
    tripId: new mongoose.Types.ObjectId(tripId),
    userId: new mongoose.Types.ObjectId(userId),
  }).sort({ createdAt: -1 });
  return order ? toPhotobookOrderDTO(order) : null;
}

export async function listAdminOrders(args: {
  status?: PhotobookOrderStatus;
}): Promise<PhotobookOrderDTO[]> {
  const filter = args.status ? { status: args.status } : {};
  const orders = await PhotobookOrder.find(filter).sort({ createdAt: -1 });

  const tripIds = [...new Set(orders.map((o) => String(o.tripId)))];
  const userIds = [...new Set(orders.map((o) => String(o.userId)))];

  const [trips, users] = await Promise.all([
    TripModel.find({ _id: { $in: tripIds } }).select('name').lean(),
    User.find({ _id: { $in: userIds } }).select('displayName').lean(),
  ]);

  const tripNameById = new Map(trips.map((t) => [String(t._id), t.name as string]));
  const userNameById = new Map(users.map((u) => [String(u._id), u.displayName as string]));

  return orders.map((order) => {
    const tripName = tripNameById.get(String(order.tripId));
    const userDisplayName = userNameById.get(String(order.userId));
    return toPhotobookOrderDTO(order, {
      ...(tripName ? { tripName } : {}),
      ...(userDisplayName ? { userDisplayName } : {}),
    });
  });
}

export async function getQuoteForOrder(orderId: string) {
  const order = await PhotobookOrder.findById(orderId);
  if (!order) throw createHttpError('Order not found', 404, 'NOT_FOUND');

  const quote = await getProdigiQuote({
    sku: order.sku ?? photobookSku(),
    copies: order.copies,
    destinationCountryCode: order.shippingAddress.countryCode,
    shippingMethod: order.shippingMethod,
  });

  order.prodigiQuote = quote;
  await order.save();
  return quote;
}

export async function approveOrder(orderId: string): Promise<PhotobookOrderDTO> {
  const order = await PhotobookOrder.findById(orderId);
  if (!order) throw createHttpError('Order not found', 404, 'NOT_FOUND');
  if (order.status !== 'awaiting_approval') {
    throw createHttpError('Order is not awaiting approval', 409, 'INVALID_STATUS');
  }
  await submitOrderToProdigi(order);
  return toPhotobookOrderDTO(order);
}

export async function rejectOrder(orderId: string, reason?: string): Promise<PhotobookOrderDTO> {
  const order = await PhotobookOrder.findById(orderId);
  if (!order) throw createHttpError('Order not found', 404, 'NOT_FOUND');
  if (order.status !== 'awaiting_approval') {
    throw createHttpError('Order is not awaiting approval', 409, 'INVALID_STATUS');
  }
  const trimmed = reason?.trim();
  order.status = 'rejected';
  order.set('errorMessage', trimmed ? trimmed.slice(0, 500) : undefined);
  await order.save();

  const tripDoc = await loadTripDoc(order.tripId);
  if (tripDoc) await notifyUser(order, tripDoc, 'rejected');

  return toPhotobookOrderDTO(order);
}

export async function retryOrder(orderId: string): Promise<PhotobookOrderDTO> {
  const order = await PhotobookOrder.findById(orderId);
  if (!order) throw createHttpError('Order not found', 404, 'NOT_FOUND');
  if (order.status !== 'failed') {
    throw createHttpError('Only failed orders can be retried', 409, 'INVALID_STATUS');
  }
  await submitOrderToProdigi(order);
  return toPhotobookOrderDTO(order);
}
