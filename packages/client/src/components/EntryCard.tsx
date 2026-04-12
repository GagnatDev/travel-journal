import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Entry } from '@travel-journal/shared';

import { formatEntryContent } from '../utils/formatEntryContent.js';

import { AuthenticatedImage } from './AuthenticatedImage.js';
import { Avatar } from './ui/Avatar.js';
import { ReactionBar } from './ReactionBar.js';
import { CommentSection } from './CommentSection.js';

interface EntryCardProps {
  entry: Entry;
  tripId: string;
  currentUserId: string;
  onDelete?: (entryId: string) => void;
}

function getRelativeTime(dateStr: string, language: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(language, { month: 'short', day: 'numeric' });
}

export function EntryCard({ entry, tripId, currentUserId, onDelete }: EntryCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const isAuthor = entry.authorId === currentUserId;

  const relativeTime = getRelativeTime(entry.createdAt, i18n.language);

  const [heroImage, ...moreImages] = entry.images
    .slice()
    .sort((a, b) => a.order - b.order);

  return (
    <article className="bg-bg-secondary rounded-card border border-caption/10 overflow-hidden">
      {/* Hero image */}
      {heroImage && (
        <div className="w-full aspect-[4/3] overflow-hidden">
          <AuthenticatedImage
            mediaKey={heroImage.key}
            alt={entry.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Author row */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <Avatar name={entry.authorName} size="sm" />
        <span className="font-ui text-sm font-medium text-body flex-1 min-w-0 truncate">
          {entry.authorName}
        </span>
        <span className="font-ui text-xs text-caption shrink-0">{relativeTime}</span>

        {isAuthor && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label={t('entries.moreOptions')}
              onClick={() => setOverflowOpen((v) => !v)}
              className="font-ui text-caption hover:text-heading transition-colors px-1"
            >
              ⋯
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-6 z-10 bg-bg-primary border border-caption/20 rounded-round-eight shadow-md flex flex-col py-1 min-w-[90px]">
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    navigate(`/trips/${tripId}/entries/${entry.id}/edit`);
                  }}
                  className="font-ui text-xs text-accent px-3 py-2 hover:bg-bg-secondary text-left"
                  aria-label={t('entries.edit')}
                >
                  {t('entries.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverflowOpen(false);
                    onDelete?.(entry.id);
                  }}
                  className="font-ui text-xs text-red-500 px-3 py-2 hover:bg-bg-secondary text-left"
                  aria-label={t('entries.delete')}
                >
                  {t('entries.delete')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <h2 className="font-display text-xl text-heading leading-snug px-4 mt-1">{entry.title}</h2>

      {/* Location */}
      {entry.location?.name && (
        <p className="font-ui text-xs text-caption px-4 mt-1">{entry.location.name}</p>
      )}

      {/* Additional images */}
      {moreImages.length > 0 && (
        <div className="flex gap-2 flex-wrap px-4 mt-3">
          {moreImages.map((img) => (
            <AuthenticatedImage
              key={img.key}
              mediaKey={img.key}
              alt=""
              loading="lazy"
              className="h-20 w-20 object-cover rounded"
            />
          ))}
        </div>
      )}

      {/* Full content */}
      <div
        className="font-ui text-sm text-body leading-relaxed px-4 mt-2"
        dangerouslySetInnerHTML={{ __html: formatEntryContent(entry.content) }}
      />

      {/* Reactions and Comments */}
      <div className="px-4 pb-4 mt-2 space-y-2">
        <ReactionBar
          tripId={tripId}
          entryId={entry.id}
          reactions={entry.reactions}
        />
        <CommentSection tripId={tripId} entryId={entry.id} />
      </div>
    </article>
  );
}
