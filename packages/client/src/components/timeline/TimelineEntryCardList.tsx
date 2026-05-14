import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Entry } from '@travel-journal/shared';

import { EntryCard } from '../EntryCard.js';

/** Vitest sets `process.env.VITEST`; `import.meta.env.MODE` stays `development` under default Vitest config. */
const useFlatTimelineList =
  typeof process !== 'undefined' && process.env['VITEST'] === 'true';

interface TimelineEntryCardListProps {
  entries: Entry[];
  tripId: string;
  currentUserId: string;
  canManageEntries: boolean;
  isTripCreator?: boolean;
  photobookCoverImageKey?: string;
  onDelete: (entryId: string) => void;
}

/** Plain list for vitest (no layout engine); window virtualizer in app builds. */
function TimelineEntryCardListFlat({
  entries,
  tripId,
  currentUserId,
  canManageEntries,
  isTripCreator,
  photobookCoverImageKey,
  onDelete,
}: TimelineEntryCardListProps) {
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.id} className="pb-4" data-entry-id={entry.id}>
          <EntryCard
            entry={entry}
            tripId={tripId}
            currentUserId={currentUserId}
            canManageEntries={canManageEntries}
            isTripCreator={Boolean(isTripCreator)}
            {...(photobookCoverImageKey != null && photobookCoverImageKey !== ''
              ? { photobookCoverImageKey }
              : {})}
            onDelete={onDelete}
          />
        </div>
      ))}
    </>
  );
}

function TimelineEntryCardListVirtual({
  entries,
  tripId,
  currentUserId,
  canManageEntries,
  isTripCreator,
  photobookCoverImageKey,
  onDelete,
}: TimelineEntryCardListProps) {
  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length,
    estimateSize: () => 520,
    overscan: 6,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const entry = entries[virtualRow.index];
        if (!entry) return null;
        return (
          <div
            key={entry.id}
            data-entry-id={entry.id}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className="absolute left-0 top-0 w-full pb-4"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <EntryCard
              entry={entry}
              tripId={tripId}
              currentUserId={currentUserId}
              canManageEntries={canManageEntries}
              isTripCreator={Boolean(isTripCreator)}
              {...(photobookCoverImageKey != null && photobookCoverImageKey !== ''
                ? { photobookCoverImageKey }
                : {})}
              onDelete={onDelete}
            />
          </div>
        );
      })}
    </div>
  );
}

export function TimelineEntryCardList(props: TimelineEntryCardListProps) {
  if (props.entries.length === 0) {
    return null;
  }

  if (useFlatTimelineList) {
    return <TimelineEntryCardListFlat {...props} />;
  }

  return <TimelineEntryCardListVirtual {...props} />;
}
