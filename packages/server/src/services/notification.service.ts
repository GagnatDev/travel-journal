import mongoose from 'mongoose';
import webpush from 'web-push';
import type { Entry } from '@travel-journal/shared';

import { logger } from '../logger.js';
import { PushSubscription } from '../models/PushSubscription.model.js';
import { Trip as TripModel } from '../models/Trip.model.js';

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

export async function dispatchNewEntryNotification(entry: Entry): Promise<void> {
  if (!configureWebPushIfNeeded()) {
    return;
  }

  const trip = await TripModel.findById(entry.tripId).lean();
  if (!trip) {
    return;
  }

  const recipientUserIds = trip.members
    .filter((member) => {
      const userId = String(member.userId);
      if (userId === entry.authorId) return false;
      return member.notificationPreferences?.newEntriesPushEnabled ?? true;
    })
    .map((member) => new mongoose.Types.ObjectId(String(member.userId)));

  if (!recipientUserIds.length) {
    return;
  }

  const subscriptions = await PushSubscription.find({
    userId: { $in: recipientUserIds },
    $or: [{ disabledAt: null }, { disabledAt: { $exists: false } }],
  }).lean();

  if (!subscriptions.length) {
    return;
  }

  const payload = JSON.stringify({
    type: 'trip.new_entry',
    tripId: entry.tripId,
    entryId: entry.id,
    title: `New entry in ${trip.name}`,
    body: `${entry.authorName || 'A trip member'}: ${entry.title}`,
    url: `/trips/${entry.tripId}/timeline?entryId=${entry.id}`,
  });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
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
          { err, endpoint: subscription.endpoint },
          'Failed to deliver trip.new_entry push notification',
        );
      }
    }),
  );
}
