import { useMemo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Entry } from '@travel-journal/shared';

import { DayHeader } from '../DayHeader.js';
import { EntryCard } from '../EntryCard.js';
import type { DayGroup } from '../../utils/groupEntriesByDay.js';

/** Vitest sets `process.env.VITEST`; `import.meta.env.MODE` stays `development` under default Vitest config. */
const useFlatStoryTimeline =
  typeof process !== 'undefined' && process.env['VITEST'] === 'true';

type StoryTimelineRow =
  | {
      type: 'header';
      key: string;
      date: Date;
      dayNumber: number | null;
      locationSummary: string | undefined;
    }
  | { type: 'entry'; key: string; entry: Entry; isFirstInDay: boolean };

function flattenDayGroups(groups: DayGroup[]): StoryTimelineRow[] {
  const rows: StoryTimelineRow[] = [];
  for (const group of groups) {
    rows.push({
      type: 'header',
      key: `header:${group.date.toISOString()}`,
      date: group.date,
      dayNumber: group.dayNumber,
      locationSummary: group.locationSummary,
    });
    group.entries.forEach((entry, i) => {
      rows.push({
        type: 'entry',
        key: entry.id,
        entry,
        isFirstInDay: i === 0,
      });
    });
  }
  return rows;
}

interface StoryModeTimelineListProps {
  dayGroups: DayGroup[];
  tripId: string;
  currentUserId: string;
  canManageEntries: boolean;
  isTripCreator?: boolean;
  photobookCoverImageKey?: string;
  onDelete: (entryId: string) => void;
}

function StoryModeTimelineListFlat({
  dayGroups,
  tripId,
  currentUserId,
  canManageEntries,
  isTripCreator,
  photobookCoverImageKey,
  onDelete,
}: StoryModeTimelineListProps) {
  const rows = useMemo(() => flattenDayGroups(dayGroups), [dayGroups]);
  return (
    <>
      {rows.map((row) =>
        row.type === 'header' ? (
          <DayHeader
            key={row.key}
            date={row.date}
            dayNumber={row.dayNumber}
            {...(row.locationSummary !== undefined ? { locationSummary: row.locationSummary } : {})}
          />
        ) : (
          <div
            key={row.key}
            data-entry-id={row.entry.id}
            className={row.isFirstInDay ? 'pt-4 pb-4' : 'pb-4'}
          >
            <EntryCard
              entry={row.entry}
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
        ),
      )}
    </>
  );
}

function StoryModeTimelineListVirtual({
  dayGroups,
  tripId,
  currentUserId,
  canManageEntries,
  isTripCreator,
  photobookCoverImageKey,
  onDelete,
}: StoryModeTimelineListProps) {
  const rows = useMemo(() => flattenDayGroups(dayGroups), [dayGroups]);

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => (rows[index]?.type === 'header' ? 96 : 520),
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? String(index),
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;
        if (row.type === 'header') {
          return (
            <div
              key={row.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <DayHeader
                date={row.date}
                dayNumber={row.dayNumber}
                {...(row.locationSummary !== undefined
                  ? { locationSummary: row.locationSummary }
                  : {})}
              />
            </div>
          );
        }
        return (
          <div
            key={row.key}
            data-entry-id={row.entry.id}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className={`absolute left-0 top-0 w-full ${row.isFirstInDay ? 'pt-4 pb-4' : 'pb-4'}`}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <EntryCard
              entry={row.entry}
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

export function StoryModeTimelineList(props: StoryModeTimelineListProps) {
  if (props.dayGroups.length === 0) {
    return null;
  }

  if (useFlatStoryTimeline) {
    return <StoryModeTimelineListFlat {...props} />;
  }

  return <StoryModeTimelineListVirtual {...props} />;
}
