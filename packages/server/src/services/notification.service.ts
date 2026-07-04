import mongoose from 'mongoose';
import webpush from 'web-push';
import type { Entry, NotificationData } from '@travel-journal/shared';
import { notificationLinkFor } from '@travel-journal/shared';

import { logger } from '../logger.js';
import { Notification } from '../models/Notification.model.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { Trip as TripModel, readTripMemberEntryMode } from '../models/Trip.model.js';
import { User } from '../models/User.model.js';

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
