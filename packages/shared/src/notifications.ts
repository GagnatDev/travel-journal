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
