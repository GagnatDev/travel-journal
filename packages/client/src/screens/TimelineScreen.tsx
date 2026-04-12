import { useRef, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { EntriesPage } from '../api/entries.js';
import { deleteEntry, fetchEntriesPage } from '../api/entries.js';
import { fetchTrip } from '../api/trips.js';
import { PendingEntryPreviewList } from '../components/timeline/PendingEntryPreviewList.js';
import { StoryModeToggle } from '../components/timeline/StoryModeToggle.js';
import { TimelineEntryCardList } from '../components/timeline/TimelineEntryCardList.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { DayHeader } from '../components/DayHeader.js';
import { useAuth } from '../context/AuthContext.js';
import { useInfiniteScrollSentinel } from '../hooks/useInfiniteScrollSentinel.js';
import { usePendingEntriesForTrip } from '../hooks/usePendingEntriesForTrip.js';
import { groupEntriesByDay } from '../utils/groupEntriesByDay.js';

export function TimelineScreen() {
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const storyModeKey = `storyMode:${tripId}`;
  const [storyMode, setStoryMode] = useState<boolean>(
    () => localStorage.getItem(storyModeKey) === 'true',
  );
  const pendingEntries = usePendingEntriesForTrip(tripId);

  const toggleStoryMode = useCallback(() => {
    setStoryMode((prev) => {
      const next = !prev;
      localStorage.setItem(storyModeKey, String(next));
      return next;
    });
  }, [storyModeKey]);

  const { data: trip = null } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId!, accessToken!),
    enabled: !!accessToken && !!tripId,
  });
  const myMember = trip?.members.find((m) => m.userId === user?.id);
  const tripRole = myMember?.tripRole;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<EntriesPage, Error, { pages: EntriesPage[] }, [string, string], number>({
    queryKey: ['entries', tripId!],
    queryFn: ({ pageParam }) => fetchEntriesPage(tripId!, pageParam, accessToken!),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap((p) => p.entries).length;
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    enabled: !!accessToken && !!tripId,
  });

  const allEntries = data?.pages.flatMap((p) => p.entries) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteEntry(tripId!, entryId, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries', tripId] });
    },
  });

  const handleDelete = useCallback(
    (entryId: string) => {
      if (window.confirm(t('entries.deleteConfirm'))) {
        deleteMutation.mutate(entryId);
      }
    },
    [deleteMutation, t],
  );

  useInfiniteScrollSentinel(sentinelRef, fetchNextPage, !!hasNextPage, isFetchingNextPage);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <p className="font-ui text-body">{t('common.loading')}</p>
      </div>
    );
  }

  const dayGroups = storyMode ? groupEntriesByDay(allEntries, trip?.departureDate) : null;
  const listProps = {
    tripId: tripId!,
    currentUserId: user?.id ?? '',
    onDelete: handleDelete,
  };

  return (
    <div className="min-h-screen bg-bg-primary pb-28 pt-14">
      <div className="px-4 pt-4 pb-2 flex items-center justify-end">
        <StoryModeToggle storyMode={storyMode} onToggle={toggleStoryMode} t={t} />
      </div>

      <main className="px-4 space-y-4">
        {tripId && <PendingEntryPreviewList tripId={tripId} pendingEntries={pendingEntries} t={t} />}

        {allEntries.length === 0 && pendingEntries.length === 0 ? (
          <p className="font-ui text-body text-center py-12 text-caption">
            {t('entries.emptyState')}
          </p>
        ) : storyMode && dayGroups ? (
          dayGroups.map((group) => (
            <div key={group.date.toISOString()}>
              <DayHeader
                date={group.date}
                dayNumber={group.dayNumber}
                {...(group.locationSummary !== undefined
                  ? { locationSummary: group.locationSummary }
                  : {})}
              />
              <div className="space-y-4 mt-4">
                <TimelineEntryCardList entries={group.entries} {...listProps} />
              </div>
            </div>
          ))
        ) : (
          <TimelineEntryCardList entries={allEntries} {...listProps} />
        )}

        <div ref={sentinelRef} className="h-1" aria-hidden="true" data-testid="scroll-sentinel" />

        {isFetchingNextPage && (
          <p className="font-ui text-xs text-caption text-center py-2">{t('common.loading')}</p>
        )}
      </main>

      <BottomNavBar {...(tripId !== undefined && { tripId })} {...(tripRole !== undefined && { tripRole })} />
    </div>
  );
}
