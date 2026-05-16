import { useTranslation } from 'react-i18next';
import type { AppNotification } from '@travel-journal/shared';

import { notificationLinkFor } from '../../notifications/links.js';

interface NotificationItemProps {
  notification: AppNotification;
  onActivate: (notification: AppNotification, href: string) => void;
  onDismiss: (notification: AppNotification) => void;
}

interface ItemRenderProps {
  title: string;
  body: string;
  actionLabel?: string;
}

function useItemRender(notification: AppNotification): ItemRenderProps {
  const { t } = useTranslation();
  const { data } = notification;
  switch (data.type) {
    case 'trip.new_entry':
      return {
        title: t('notifications.item.tripNewEntry.title', { authorName: data.authorName }),
        body: t('notifications.item.tripNewEntry.body', {
          entryTitle: data.entryTitle,
          tripName: data.tripName,
        }),
      };
    case 'trip.new_entry_digest':
      return {
        title: t('notifications.item.tripNewEntryDigest.title', {
          count: data.entryCount,
          tripName: data.tripName,
        }),
        body: t('notifications.item.tripNewEntryDigest.body', {
          count: data.entryCount,
          tripName: data.tripName,
        }),
      };
    case 'trip.member_added':
      return {
        title: t('notifications.item.tripMemberAdded.title', { tripName: data.tripName }),
        body:
          data.tripRole === 'contributor'
            ? t('notifications.item.tripMemberAdded.bodyContributor', {
                addedByDisplayName: data.addedByDisplayName.trim() || t('notifications.item.tripMemberAdded.unknownInviter'),
              })
            : t('notifications.item.tripMemberAdded.bodyFollower', {
                addedByDisplayName: data.addedByDisplayName.trim() || t('notifications.item.tripMemberAdded.unknownInviter'),
              }),
      };
    case 'trip.photobook_pdf_ready':
      return {
        title: t('notifications.item.tripPhotobookPdfReady.title', { tripName: data.tripName }),
        body: t('notifications.item.tripPhotobookPdfReady.body', { tripName: data.tripName }),
        actionLabel: t('notifications.item.tripPhotobookPdfReady.openAction'),
      };
    case 'system.release_announcement':
      return {
        title: t('notifications.item.releaseAnnouncement.title', { version: data.version }),
        body: t('notifications.item.releaseAnnouncement.body'),
        actionLabel: t('notifications.item.releaseAnnouncement.updateAction'),
      };
    case 'user.private_message':
      return {
        title: t('notifications.item.privateMessage.title', { fromUserName: data.fromUserName }),
        body: t('notifications.item.privateMessage.body', { preview: data.preview }),
        actionLabel: t('notifications.item.privateMessage.openAction'),
      };
  }
}

function formatRelativeTime(iso: string, language: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return '<1m';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(language, { month: 'short', day: 'numeric' });
}

export function NotificationItem({ notification, onActivate, onDismiss }: NotificationItemProps) {
  const { t, i18n } = useTranslation();
  const { title, body } = useItemRender(notification);
  const href = notificationLinkFor(notification.data);
  const unread = notification.readAt === null;
  const time = formatRelativeTime(notification.createdAt, i18n.language);

  return (
    <li
      className={`group relative rounded-lg border px-3 py-3 transition-colors ${
        unread
          ? 'border-accent/30 bg-accent/5'
          : 'border-caption/10 bg-bg-secondary'
      }`}
      data-testid={`notification-item-${notification.id}`}
      data-unread={unread ? 'true' : 'false'}
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onActivate(notification, href)}
          className="flex-1 text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
        >
          <div className="flex items-start gap-2">
            {unread && (
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="font-ui text-sm text-heading font-medium truncate">{title}</p>
              <p className="font-ui text-xs text-body mt-0.5 line-clamp-2">{body}</p>
              <p className="font-ui text-[11px] text-caption mt-1">{time}</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          aria-label={t('notifications.dismiss')}
          onClick={() => onDismiss(notification)}
          className="shrink-0 text-caption hover:text-body transition-colors p-1 min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-md"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </li>
  );
}
