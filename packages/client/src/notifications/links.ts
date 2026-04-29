import type { NotificationData } from '@travel-journal/shared';

/**
 * Local mirror of `notificationLinkFor` from `@travel-journal/shared`.
 *
 * The shared package currently compiles to CommonJS so bundlers can't
 * statically resolve its runtime exports when tree-shaking. Keep this in lock
 * step with `packages/shared/src/notifications.ts#notificationLinkFor`.
 */
export function notificationLinkFor(data: NotificationData): string {
  switch (data.type) {
    case 'trip.new_entry':
      return `/trips/${data.tripId}/timeline?entryId=${data.entryId}`;
    case 'trip.new_entry_digest':
      return `/trips/${data.tripId}/timeline`;
    case 'trip.member_added':
      return `/trips?highlightTripId=${data.tripId}`;
    case 'trip.photobook_pdf_ready':
      return `/trips/${data.tripId}/settings`;
    case 'system.release_announcement':
      return '/trips';
    case 'user.private_message':
      return `/messages/${data.threadId}`;
  }
}
