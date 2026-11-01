import mongoose from 'mongoose';
import webpush from 'web-push';
import type { Entry, NotificationData } from '@travel-journal/shared';
import { notificationLinkFor } from '@travel-journal/shared';

import { logger } from '../logger.js';
import { Notification } from '../models/Notification.model.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { Trip as TripModel, readTripMemberEntryMode } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';
import { readVapidConfig } from './vapidConfig.js';

/** Public key webpush is currently configured with, so a key change re-configures it. */
let configuredPublicKey: string | undefined;

/** Returns the active VAPID public key, or `null` when push is not configured. */
function configureWebPushIfNeeded(): string | null {
  const config = readVapidConfig();
  if (!config) {
    return null;
  }
  if (configuredPublicKey !== config.publicKey) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configuredPublicKey = config.publicKey;
  }
  return config.publicKey;
}

function pushStatusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number })?.statusCode;
}

function isGoneStatusCode(err: unknown): boolean {
  const statusCode = pushStatusCode(err);
  return statusCode === 404 || statusCode === 410;
}

/**
 * Push services answer 401/403 when the request's VAPID key isn't the one the browser
 * subscribed with (e.g. FCM 403, Mozilla autopush 401), which is what happens to every
 * existing subscription after the keypair changes.
 */
function isVapidMismatchStatusCode(err: unknown): boolean {
  const statusCode = pushStatusCode(err);
  return statusCode === 401 || statusCode === 403;
}

/**
 * Persist one inbox notification per recipient. Returns the created docs
 * (keyed by user id) so callers can include `notificationId` in any push
 * payload delivered to that user.
 */
export async function enqueueNotifications(
  userIds: mongoose.Types.ObjectId[],
  data: NotificationData,
): Promise<Map<string, string>> {
  if (!userIds.length) {
    return new Map();
  }

  const docs = await Notification.insertMany(
    userIds.map((userId) => ({ userId, type: data.type, data })),
  );

  const byUser = new Map<string, string>();
  for (const doc of docs) {
    byUser.set(String(doc.userId), String(doc._id));
  }
  return byUser;
}

interface DeliverPushOptions {
  /** Human-readable title shown in the system notification. */
  title: string;
  /** Human-readable body shown in the system notification. */
  body: string;
  /** Structured data used by the SW + app for rendering and deep-linking. */
  data: NotificationData;
  /**
   * Optional per-user notificationId used so the app can mark that specific
   * inbox row read when the push is clicked.
   */
  notificationIdByUser?: Map<string, string>;
}

export async function deliverWebPush(
  userIds: mongoose.Types.ObjectId[],
  options: DeliverPushOptions,
): Promise<void> {
  const activePublicKey = configureWebPushIfNeeded();
  if (!activePublicKey) {
    return;
  }
  if (!userIds.length) {
    return;
  }

  const subscriptions = await PushSubscription.find({
    userId: { $in: userIds },
    $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }],
  }).lean();

  if (!subscriptions.length) {
    return;
  }

  const url = notificationLinkFor(options.data);

  const disable = (id: mongoose.Types.ObjectId) =>
    PushSubscription.updateOne({ _id: id }, { $set: { disabledAt: new Date() } });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      // Made under another VAPID keypair: the push service will reject it. The client
      // re-subscribes with the current key on its next start (notifications/push.ts).
      if (subscription.vapidPublicKey && subscription.vapidPublicKey !== activePublicKey) {
        await disable(subscription._id);
        return;
      }
      const notificationId = options.notificationIdByUser?.get(String(subscription.userId));
      const payload = JSON.stringify({
        type: options.data.type,
        title: options.title,
        body: options.body,
        url,
        data: options.data,
        notificationId,
      });
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload,
        );
        if (!subscription.vapidPublicKey) {
          // Legacy row that works with the current key: record it, so a later 401/403 for
          // this row is treated as a server-side problem rather than a stale key.
          await PushSubscription.updateOne(
            { _id: subscription._id },
            { $set: { vapidPublicKey: activePublicKey } },
          );
        }
      } catch (err) {
        if (isGoneStatusCode(err)) {
          await disable(subscription._id);
          return;
        }
        if (isVapidMismatchStatusCode(err) && !subscription.vapidPublicKey) {
          // Legacy row (no recorded key) rejected for its VAPID key: it was made under
          // the previous keypair. Rows stamped with the current key are NOT disabled on
          // 401/403, so a broken server keypair can't wipe every subscription.
          await disable(subscription._id);
          return;
        }
        logger.warn(
          { err, endpoint: subscription.endpoint, type: options.data.type },
          'Failed to deliver push notification',
        );
      }
    }),
  );
}

export interface TripMemberAddedInput {
  tripId: string;
  /** The user who was just added to the trip. */
  userId: string;
  tripRole: 'contributor' | 'follower';
  addedByUserId: string;
  addedByName: string;
}

/**
 * Notify a user that they were added to a trip as contributor or follower,
 * so they learn the trip exists (inbox row + push if subscribed).
 */
export async function dispatchTripMemberAddedNotification(
  input: TripMemberAddedInput,
): Promise<void> {
  const trip = await TripModel.findById(input.tripId).lean();
  if (!trip) {
    return;
  }

  const recipientId = new mongoose.Types.ObjectId(input.userId);
  const data: NotificationData = {
    type: 'trip.member_added',
    tripId: input.tripId,
    tripName: trip.name,
    tripRole: input.tripRole,
    addedByUserId: input.addedByUserId,
    addedByName: input.addedByName,
  };

  const notificationIdByUser = await enqueueNotifications([recipientId], data);

  const recipient = await User.findById(recipientId).lean();
  const locale = recipient?.preferredLocale === 'en' ? 'en' : 'nb';
  const addedByLabel = input.addedByName.trim() || (locale === 'en' ? 'A member' : 'En deltaker');

  const title =
    locale === 'en' ? `You've been added to ${trip.name}` : `Du er lagt til i ${trip.name}`;
  const body =
    locale === 'en'
      ? input.tripRole === 'contributor'
        ? `${addedByLabel} added you as a contributor.`
        : `${addedByLabel} added you as a follower.`
      : input.tripRole === 'contributor'
        ? `${addedByLabel} la deg til som bidragsyter.`
        : `${addedByLabel} la deg til som følger.`;

  await deliverWebPush([recipientId], {
    title,
    body,
    data,
    notificationIdByUser,
  });
}

export async function dispatchNewEntryNotification(entry: Entry): Promise<void> {
  const trip = await TripModel.findById(entry.tripId).lean();
  if (!trip) {
    return;
  }

  const recipientUserIds = trip.members
    .filter((member) => {
      const userId = String(member.userId);
      if (userId === entry.authorId) return false;
      return readTripMemberEntryMode(member.notificationPreferences) === 'per_entry';
    })
    .map((member) => new mongoose.Types.ObjectId(String(member.userId)));

  if (!recipientUserIds.length) {
    return;
  }

  const data: NotificationData = {
    type: 'trip.new_entry',
    tripId: entry.tripId,
    tripName: trip.name,
    entryId: entry.id,
    entryTitle: entry.title,
    authorId: entry.authorId,
    authorName: entry.authorName,
  };

  const notificationIdByUser = await enqueueNotifications(recipientUserIds, data);

  const authorLabel = entry.authorName?.trim() || 'En deltaker';

  await deliverWebPush(recipientUserIds, {
    title: `Nytt innlegg i ${trip.name}`,
    body: `${authorLabel}: ${entry.title}`,
    data,
    notificationIdByUser,
  });
}
