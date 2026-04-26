import mongoose from 'mongoose';
import type { TripNewEntryDigestNotificationData } from '@travel-journal/shared';

import { logger } from '../logger.js';
import { Entry } from '../models/Entry.model.js';
import { Trip as TripModel, readTripMemberEntryMode } from '../models/Trip.model.js';

import { deliverWebPush, enqueueNotifications } from './notification.service.js';

/** How far back the evening digest looks for new entries. */
export const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

interface RunDigestOptions {
  /**
   * End of the digest window (exclusive). Defaults to `new Date()`. Exposed so
   * tests can pin the clock without stubbing `Date`.
   */
  now?: Date;
}

interface DigestResult {
  trips: number;
  recipients: number;
  pushesSent: number;
}

/**
 * Build and deliver the daily "new entries" digest to every member who has
 * opted into `daily_digest` mode, once per `(trip, user)` pair. A member
 * receives a digest only if at least one entry, not authored by them, landed
 * in the trip within the digest window.
 *
 * Idempotency: there is no per-run checkpoint; re-running within the same
 * window would enqueue duplicate rows. Callers (cron, admin tools) are
 * expected to invoke this at most once per day.
 */
export async function runDailyEntryDigest(options: RunDigestOptions = {}): Promise<DigestResult> {
  const now = options.now ?? new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - DIGEST_WINDOW_MS);

  const trips = await TripModel.find({
    'members.notificationPreferences.newEntriesMode': 'daily_digest',
  }).lean();

  let recipients = 0;
  let pushesSent = 0;

  for (const trip of trips) {
    const digestMembers = trip.members.filter(
      (m) => readTripMemberEntryMode(m.notificationPreferences) === 'daily_digest',
    );
    if (!digestMembers.length) continue;

    const entries = await Entry.find({
      tripId: trip._id,
      deletedAt: null,
      publicationStatus: { $ne: 'draft' },
      createdAt: { $gte: windowStart, $lt: windowEnd },
    })
      .select({ authorId: 1 })
      .lean();

    if (!entries.length) continue;

    for (const member of digestMembers) {
      const memberId = String(member.userId);
      const entryCount = entries.filter((e) => String(e.authorId) !== memberId).length;
      if (entryCount === 0) continue;

      const data: TripNewEntryDigestNotificationData = {
        type: 'trip.new_entry_digest',
        tripId: String(trip._id),
        tripName: trip.name,
        entryCount,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      };

      const userObjectId = new mongoose.Types.ObjectId(memberId);
      const notificationIdByUser = await enqueueNotifications([userObjectId], data);
      recipients += 1;

      const title = `I dag i ${trip.name}`;
      const body =
        entryCount === 1 ? '1 nytt innlegg i dag' : `${entryCount} nye innlegg i dag`;

      const pushesBefore = pushesSent;
      await deliverWebPush([userObjectId], {
        title,
        body,
        data,
        notificationIdByUser,
      });
      // `deliverWebPush` swallows per-endpoint errors; we only track that we
      // attempted a delivery here.
      pushesSent = pushesBefore + 1;
    }
  }

  logger.info(
    { trips: trips.length, recipients, windowStart, windowEnd },
    'runDailyEntryDigest completed',
  );

  return { trips: trips.length, recipients, pushesSent };
}
