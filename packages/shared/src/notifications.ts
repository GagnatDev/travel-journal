export type NotificationType =
  | 'trip.new_entry'
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
    case 'system.release_announcement':
      return '/trips';
    case 'user.private_message':
      return `/messages/${data.threadId}`;
  }
}
