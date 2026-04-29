export type NotificationType =
  | 'trip.new_entry'
  | 'trip.new_entry_digest'
  | 'trip.photobook_pdf_ready'
  | 'system.release_announcement'
  | 'user.private_message';

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface UpsertPushSubscriptionRequest {
  subscription: PushSubscriptionInput;
  deviceLabel?: string;
}

export interface DeletePushSubscriptionRequest {
  endpoint: string;
}

export interface TripNewEntryNotificationData {
  type: 'trip.new_entry';
  tripId: string;
  tripName: string;
  entryId: string;
  entryTitle: string;
  authorId: string;
  authorName: string;
}

/**
 * Daily roll-up of new entries in a trip, delivered once a day to members who
 * have opted into `daily_digest` mode. `entryCount` is the number of entries
 * created in the window between `windowStart` and `windowEnd` (inclusive-exclusive).
 */
export interface TripNewEntryDigestNotificationData {
  type: 'trip.new_entry_digest';
  tripId: string;
  tripName: string;
  entryCount: number;
  windowStart: string;
  windowEnd: string;
}

/** Photobook PDF finished generating; deep-link opens trip settings to download. */
export interface TripPhotobookPdfReadyNotificationData {
  type: 'trip.photobook_pdf_ready';
  tripId: string;
  tripName: string;
}

export interface ReleaseAnnouncementNotificationData {
  type: 'system.release_announcement';
  version: string;
  releaseNotesUrl?: string;
}

export interface PrivateMessageNotificationData {
  type: 'user.private_message';
  threadId: string;
  fromUserId: string;
  fromUserName: string;
  preview: string;
}

export type NotificationData =
  | TripNewEntryNotificationData
  | TripNewEntryDigestNotificationData
  | TripPhotobookPdfReadyNotificationData
  | ReleaseAnnouncementNotificationData
  | PrivateMessageNotificationData;

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** ISO 8601 timestamp for when the notification was created. */
  createdAt: string;
  /** ISO 8601 timestamp when the user marked it read, or null if still unread. */
  readAt: string | null;
  data: NotificationData;
}

export interface ListNotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

/**
 * Canonical deep link for a notification. Used server-side when composing push
 * payloads and client-side when navigating from the notifications panel so
 * there is exactly one place that knows the URL shape per type.
 */
export function notificationLinkFor(data: NotificationData): string {
  switch (data.type) {
    case 'trip.new_entry':
      return `/trips/${data.tripId}/timeline?entryId=${data.entryId}`;
    case 'trip.new_entry_digest':
      return `/trips/${data.tripId}/timeline`;
    case 'trip.photobook_pdf_ready':
      return `/trips/${data.tripId}/settings`;
    case 'system.release_announcement':
      return '/trips';
    case 'user.private_message':
      return `/messages/${data.threadId}`;
  }
}
