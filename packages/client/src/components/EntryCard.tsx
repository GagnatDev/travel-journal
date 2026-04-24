import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Entry } from '@travel-journal/shared';

import { formatEntryContent } from '../utils/formatEntryContent.js';
import { useAuth } from '../context/AuthContext.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  createMediaCacheKey,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';

import { AuthenticatedImage } from './AuthenticatedImage.js';
import { EntryImageCarouselModal } from './EntryImageCarouselModal.js';
import { Avatar } from './ui/Avatar.js';
import { ReactionBar } from './ReactionBar.js';
import { CommentSection } from './CommentSection.js';

const BODY_OPEN_LOCK = 'entryCarouselOpen';
const CAROUSEL_HISTORY_STATE = { __entryImageCarousel: true } as const;

interface EntryCardProps {
  entry: Entry;
  tripId: string;
  currentUserId: string;
  /** When true (trip creator or contributor), edit/delete any entry on the trip. */
  canManageEntries?: boolean;
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

export const EntryCard = memo(function EntryCard({
  entry,
  tripId,
  currentUserId,
  canManageEntries = false,
  onDelete,
}: EntryCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const prefetchedCacheKeyRef = useRef<string | null>(null);
  const carouselOwnsHistoryRef = useRef(false);

  const isAuthor = entry.authorId === currentUserId;
  const showEntryActions = canManageEntries || isAuthor;
  const isCollaboratorDraft = entry.publicationStatus === 'draft' && canManageEntries;

  const relativeTime = useMemo(
    () => getRelativeTime(entry.createdAt, i18n.language),
    [entry.createdAt, i18n.language],
  );

  const sortedImages = useMemo(
    () => [...entry.images].sort((a, b) => a.order - b.order),
    [entry.images],
  );

  const [heroImage, ...moreImages] = sortedImages;
  const carouselImages = useMemo(
    () =>
      sortedImages.map((image) => ({
        key: image.key,
        alt: entry.title,
      })),
    [entry.title, sortedImages],
  );

  const openCarousel = (index: number) => {
    if (document.body.dataset[BODY_OPEN_LOCK] === 'true') {
      return;
    }
    window.history.pushState(CAROUSEL_HISTORY_STATE, '', window.location.href);
    carouselOwnsHistoryRef.current = true;
    setActiveImageIndex(index);
    setIsCarouselOpen(true);
  };

  useEffect(() => {
    if (!isCarouselOpen) return;

    function onPopState() {
      if (!carouselOwnsHistoryRef.current) return;
      carouselOwnsHistoryRef.current = false;
      setIsCarouselOpen(false);
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isCarouselOpen]);

  const closeCarousel = useCallback(() => {
    if (carouselOwnsHistoryRef.current) {
      carouselOwnsHistoryRef.current = false;
      window.history.back();
    }
    setIsCarouselOpen(false);
  }, []);

  useEffect(() => {
    if (!accessToken || sortedImages.length === 0) return;

    const primaryImageKey = sortedImages[0]?.key;
    if (!primaryImageKey) return;

    const cacheKey = createMediaCacheKey(accessToken, primaryImageKey);
    if (prefetchedCacheKeyRef.current === cacheKey) return;

    prefetchedCacheKeyRef.current = cacheKey;
    void acquireAuthenticatedMediaObjectUrl(primaryImageKey, accessToken).catch(() => {
      if (prefetchedCacheKeyRef.current === cacheKey) {
        prefetchedCacheKeyRef.current = null;
      }
    });

    return () => {
      if (prefetchedCacheKeyRef.current) {
        releaseAuthenticatedMediaObjectUrl(prefetchedCacheKeyRef.current);
        prefetchedCacheKeyRef.current = null;
      }
    };
  }, [accessToken, sortedImages]);

  return (
    <article className="bg-bg-secondary rounded-card border border-caption/10 overflow-hidden">
      {/* Hero image */}
      {heroImage && (
        <button
          type="button"
          onClick={() => openCarousel(0)}
          aria-label={t('entries.openImageCarousel', { defaultValue: 'Open image carousel' })}
          className="block w-full aspect-[4/3] overflow-hidden"
        >
          <AuthenticatedImage
            mediaKey={heroImage.key}
            alt={entry.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </button>
      )}

      {/* Author row */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <Avatar name={entry.authorName} size="sm" />
        <span className="font-ui text-sm font-medium text-body flex-1 min-w-0 truncate">
          {entry.authorName}
        </span>
        <span className="font-ui text-xs text-caption shrink-0">{relativeTime}</span>
        {isCollaboratorDraft && (
          <span className="font-ui text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">
            {t('entries.draftBadge')}
          </span>
        )}

        {showEntryActions && (
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
          {moreImages.map((img, index) => (
            <button
              key={img.key}
              type="button"
              onClick={() => openCarousel(index + 1)}
              aria-label={t('entries.openImageCarouselAt', {
                index: index + 2,
                defaultValue: `Open image ${index + 2}`,
              })}
              className="block h-20 w-20 overflow-hidden rounded"
            >
              <AuthenticatedImage
                mediaKey={img.thumbnailKey ?? img.key}
                alt=""
                loading="lazy"
                className="h-20 w-20 object-cover rounded"
              />
            </button>
          ))}
        </div>
      )}

      {/* Full content */}
      <div
        className="font-ui text-sm text-body leading-relaxed px-4 mt-2"
        dangerouslySetInnerHTML={{ __html: formatEntryContent(entry.content) }}
      />

      {/* Reactions and comments only after publish (followers never see drafts) */}
      {!isCollaboratorDraft && (
        <div className="px-4 pb-4 mt-2 space-y-2">
          <ReactionBar tripId={tripId} entryId={entry.id} reactions={entry.reactions} />
          <CommentSection tripId={tripId} entryId={entry.id} />
        </div>
      )}

      <EntryImageCarouselModal
        images={carouselImages}
        initialIndex={activeImageIndex}
        isOpen={isCarouselOpen}
        onClose={closeCarousel}
      />
    </article>
  );
});
