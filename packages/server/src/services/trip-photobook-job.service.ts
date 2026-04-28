import mongoose from 'mongoose';
import {
  resolvePhotobookPdfLocaleKey,
  type PhotobookPdfLocaleKey,
  type TripPhotobookPdfReadyNotificationData,
} from '@travel-journal/shared';

import { logger } from '../logger.js';
import { Trip as TripModel, type ITrip } from '../models/Trip.model.js';

import { enqueueNotifications, deliverWebPush } from './notification.service.js';
import { listAllEntriesChronological } from './entry.service.js';
import { uploadTripPdf } from './media.service.js';
import { buildTripPhotobookPdf, type TripPhotobookPdfInput } from './trip-photobook-pdf.service.js';
import { getTripById } from './trip.service.js';

function readJobLocale(job: ITrip['photobookPdfJob']): PhotobookPdfLocaleKey {
  const raw =
    job && typeof job === 'object' && typeof (job as { localeKey?: string }).localeKey === 'string'
      ? (job as { localeKey: string }).localeKey
      : undefined;
  return resolvePhotobookPdfLocaleKey(raw ?? process.env['TRIP_PDF_LOCALE'] ?? 'nb');
}

function readJobTimeZone(job: ITrip['photobookPdfJob']): string | undefined {
  if (!job || typeof job !== 'object') return undefined;
  const tz = (job as { timeZone?: string }).timeZone;
  return typeof tz === 'string' && tz.trim() ? tz.trim() : undefined;
}

/**
 * Build PDF, upload to S3, update trip, notify creator (inbox + push if subscriptions exist).
 * Swallows errors into `photobookPdfJob` on the trip document.
 */
export async function runPhotobookPdfJob(tripId: string): Promise<void> {
  const doc = await TripModel.findById(tripId);
  if (!doc) {
    return;
  }
  if (doc.photobookPdfJob?.status !== 'pending') {
    return;
  }

  const trip = await getTripById(tripId);
  if (!trip) {
    return;
  }

  if (trip.status !== 'active' && trip.status !== 'completed') {
    await TripModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          photobookPdfJob: {
            status: 'failed',
            finishedAt: new Date(),
            errorMessage: 'Photobook PDF is only available for active or completed trips',
          },
        },
      },
    );
    return;
  }

  const localeKey = readJobLocale(doc.photobookPdfJob);
  const timeZone = readJobTimeZone(doc.photobookPdfJob);

  const pushTitle =
    localeKey === 'en' ? `Photobook ready: ${trip.name}` : `Fotobok klar: ${trip.name}`;
  const pushBody =
    localeKey === 'en'
      ? 'Your trip photobook PDF is ready to download.'
      : 'PDF-en til fotoboken er klar til nedlasting.';

  try {
    const entries = await listAllEntriesChronological(tripId);
    const input: TripPhotobookPdfInput = {
      trip,
      entries,
      photobookLocaleKey: localeKey,
      ...(timeZone !== undefined ? { timeZone } : {}),
    };
    const pdf = await buildTripPhotobookPdf(input);
    const key = await uploadTripPdf(tripId, pdf);

    await TripModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          photobookPdfJob: {
            status: 'ready',
            pdfStorageKey: key,
            finishedAt: new Date(),
            localeKey,
            ...(timeZone !== undefined ? { timeZone } : {}),
          },
        },
      },
    );

    const creatorId = new mongoose.Types.ObjectId(trip.createdBy);
    const data: TripPhotobookPdfReadyNotificationData = {
      type: 'trip.photobook_pdf_ready',
      tripId,
      tripName: trip.name,
    };
    const notificationIdByUser = await enqueueNotifications([creatorId], data);

    await deliverWebPush([creatorId], {
      title: pushTitle,
      body: pushBody,
      data,
      notificationIdByUser,
    });
  } catch (err) {
    logger.error({ err, tripId }, 'Photobook PDF generation failed');
    const message =
      err instanceof Error && err.message
        ? err.message.slice(0, 500)
        : 'Photobook PDF generation failed';
    await TripModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          photobookPdfJob: {
            status: 'failed',
            finishedAt: new Date(),
            errorMessage: message,
            localeKey,
            ...(timeZone !== undefined ? { timeZone } : {}),
          },
        },
      },
    );
  }
}

export function schedulePhotobookPdfJob(tripId: string): void {
  setImmediate(() => {
    void runPhotobookPdfJob(tripId).catch((err) => {
      logger.error({ err, tripId }, 'Unhandled photobook job error');
    });
  });
}
