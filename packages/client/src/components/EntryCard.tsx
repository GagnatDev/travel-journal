import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Entry } from '@travel-journal/shared';

import { formatEntryContent } from '../utils/formatEntryContent.js';

interface EntryCardProps {
  entry: Entry;
  tripId: string;
  currentUserId: string;
  onDelete?: (entryId: string) => void;
}

export function EntryCard({ entry, tripId, currentUserId, onDelete }: EntryCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const isAuthor = entry.authorId === currentUserId;

  const formattedDate = new Date(entry.createdAt).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const [heroImage, ...moreImages] = entry.images
    .slice()
    .sort((a, b) => a.order - b.order);

  return (
    <article className="bg-bg-secondary rounded-round-eight border border-caption/20 overflow-hidden">
      {/* Hero image */}
      {heroImage && (
        <img
          src={`/api/v1/media/${heroImage.key}`}
          alt={entry.title}
          loading="lazy"
          className="w-full aspect-video object-cover"
        />
      )}

      <div className="p-4 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-lg text-heading leading-snug">{entry.title}</h2>

          {isAuthor && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => navigate(`/trips/${tripId}/entries/${entry.id}/edit`)}
                className="font-ui text-xs text-accent hover:underline"
                aria-label={t('entries.edit')}
              >
                {t('entries.edit')}
              </button>
              <button
                onClick={() => onDelete?.(entry.id)}
                className="font-ui text-xs text-red-500 hover:underline"
                aria-label={t('entries.delete')}
              >
                {t('entries.delete')}
              </button>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 font-ui text-xs text-caption">
          <span>{entry.authorName}</span>
          <span>·</span>
          <span>{formattedDate}</span>
          {entry.location?.name && (
            <>
              <span>·</span>
              <span>{entry.location.name}</span>
            </>
          )}
        </div>

        {/* Content */}
        <div
          className="font-body text-sm text-body leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatEntryContent(entry.content) }}
        />

        {/* Additional images */}
        {moreImages.length > 0 && (
          <div className="flex gap-2 flex-wrap pt-1">
            {moreImages.map((img) => (
              <img
                key={img.key}
                src={`/api/v1/media/${img.key}`}
                alt=""
                loading="lazy"
                className="h-20 w-20 object-cover rounded"
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
