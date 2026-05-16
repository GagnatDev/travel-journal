import mongoose from 'mongoose';
import webpush from 'web-push';
import type { Entry, NotificationData, TripMemberAddedNotificationData } from '@travel-journal/shared';
import { notificationLinkFor } from '@travel-journal/shared';

import { logger } from '../logger.js';
import { Notification } from '../models/Notification.model.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { Trip as TripModel, readTripMemberEntryMode } from '../models/Trip.model.js';

function isWebPushConfigured(): boolean {
  return Boolean(
    process.env['WEB_PUSH_VAPID_PUBLIC_KEY'] &&
      process.env['WEB_PUSH_VAPID_PRIVATE_KEY'] &&
      process.env['WEB_PUSH_SUBJECT'],
  );
}

let vapidConfigured = false;

function configureWebPushIfNeeded(): boolean {
  if (!isWebPushConfigured()) {
    return false;
  }
  if (vapidConfigured) {
    return true;
  }

  webpush.setVapidDetails(
    process.env['WEB_PUSH_SUBJECT']!,
    process.env['WEB_PUSH_VAPID_PUBLIC_KEY']!,
    process.env['WEB_PUSH_VAPID_PRIVATE_KEY']!,
  );
  vapidConfigured = true;
  return true;
}

function isGoneStatusCode(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number })?.statusCode;
  return statusCode === 404 || statusCode === 410;
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
  if (!configureWebPushIfNeeded()) {
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

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
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
      } catch (err) {
        if (isGoneStatusCode(err)) {
          await PushSubscription.updateOne(
            { _id: subscription._id },
            { $set: { disabledAt: new Date() } },
          );
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

export async function dispatchTripMemberAddedNotification(options: {
  recipientUserId: string;
  tripId: string;
  tripName: string;
  tripRole: 'contributor' | 'follower';
  addedByUserId: string;
  addedByDisplayName: string;
}): Promise<void> {
  const data: TripMemberAddedNotificationData = {
    type: 'trip.member_added',
    tripId: options.tripId,
    tripName: options.tripName,
    tripRole: options.tripRole,
    addedByUserId: options.addedByUserId,
    addedByDisplayName: options.addedByDisplayName,
  };

  const recipientOid = new mongoose.Types.ObjectId(options.recipientUserId);
  const notificationIdByUser = await enqueueNotifications([recipientOid], data);

  const byName = options.addedByDisplayName.trim() || 'Someone';
  const title = `Du er lagt til på ${options.tripName}`;
  const body =
    options.tripRole === 'contributor'
      ? `${byName} la deg til som bidragsyter.`
      : `${byName} la deg til som følger.`;

  await deliverWebPush([recipientOid], {
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
