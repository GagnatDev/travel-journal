import type { Entry } from '@travel-journal/shared';

import { EntryCard } from '../EntryCard.js';

interface TimelineEntryCardListProps {
  entries: Entry[];
  tripId: string;
  currentUserId: string;
  onDelete: (entryId: string) => void;
}

export function TimelineEntryCardList({
  entries,
  tripId,
  currentUserId,
  onDelete,
}: TimelineEntryCardListProps) {
  return (
    <>
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          tripId={tripId}
          currentUserId={currentUserId}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
