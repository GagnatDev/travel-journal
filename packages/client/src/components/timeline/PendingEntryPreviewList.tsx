import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';

import type { PendingEntry } from '../../offline/db.js';

interface PendingEntryPreviewListProps {
  tripId: string;
  pendingEntries: PendingEntry[];
  t: TFunction;
}

export function PendingEntryPreviewList({
  tripId,
  pendingEntries,
  t,
}: PendingEntryPreviewListProps) {
  return (
    <>
      {pendingEntries.map((pending) => (
        <Link
          key={pending.localId}
          to={`/trips/${tripId}/entries/pending/${pending.localId}/edit`}
          className="block opacity-60 relative rounded-round-eight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={t('offline.editPending')}
        >
          <div className="absolute top-2 right-2 z-10">
            <span className="font-ui text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
              {pending.status === 'failed' ? t('offline.syncFailedShort') : t('offline.saved')}
            </span>
          </div>
          <div className="bg-bg-secondary border border-caption/20 rounded-round-eight p-4 space-y-1">
            <p className="font-display text-lg text-heading">{pending.payload.title}</p>
            {pending.payload.content && (
              <p className="font-ui text-sm text-body line-clamp-3">{pending.payload.content}</p>
            )}
            {pending.images.length > 0 && (
              <p className="font-ui text-xs text-caption">
                {pending.images.length}{' '}
                {pending.images.length === 1 ? 'photo' : 'photos'} pending upload
              </p>
            )}
          </div>
        </Link>
      ))}
    </>
  );
}
