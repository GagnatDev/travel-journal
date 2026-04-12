import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { EntriesPage } from '../api/entries.js';
import { deleteEntry, fetchEntriesPage } from '../api/entries.js';
import { fetchTrip } from '../api/trips.js';
import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { EntryCard } from '../components/EntryCard.js';
import { DayHeader } from '../components/DayHeader.js';
import { groupEntriesByDay } from '../utils/groupEntriesByDay.js';
import { getPendingEntriesForTrip } from '../offline/db.js';
import { PENDING_CHANGED_EVENT } from '../offline/entrySync.js';
import type { PendingEntry } from '../offline/db.js';

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
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);

  const toggleStoryMode = useCallback(() => {
    setStoryMode((prev) => {
      const next = !prev;
      localStorage.setItem(storyModeKey, String(next));
      return next;
    });
  }, [storyModeKey]);

  // Load pending offline entries for this trip and refresh on queue changes
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    async function refresh() {
      try {
        const entries = await getPendingEntriesForTrip(tripId!);
        if (!cancelled) setPendingEntries(entries);
      } catch {
        // IDB unavailable — show nothing
      }
    }

    void refresh();
    window.addEventListener(PENDING_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_CHANGED_EVENT, refresh);
    };
  }, [tripId]);

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

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <p className="font-ui text-body">{t('common.loading')}</p>
      </div>
    );
  }

  const dayGroups = storyMode ? groupEntriesByDay(allEntries, trip?.departureDate) : null;

  return (
    <div className="min-h-screen bg-bg-primary pb-28">
      <header className="px-4 pt-8 pb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-heading">{trip?.name ?? ''}</h1>
        <button
          onClick={toggleStoryMode}
          aria-label={t('storyMode.toggle')}
          aria-pressed={storyMode}
          data-testid="story-mode-toggle"
          className={`p-2 rounded-full transition-colors ${
            storyMode ? 'bg-accent/10 text-accent' : 'text-caption hover:text-heading'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </button>
      </header>

      <main className="px-4 space-y-4">
        {/* Pending offline entries shown at the top */}
        {pendingEntries.map((pending) => (
          <div
            key={pending.localId}
            className="opacity-60 relative"
            aria-label={t('offline.saved')}
          >
            <div className="absolute top-2 right-2 z-10">
              <span className="font-ui text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                {t('offline.saved')}
              </span>
            </div>
            <div className="bg-bg-secondary border border-caption/20 rounded-round-eight p-4 space-y-1">
              <p className="font-display text-lg text-heading">{pending.payload.title}</p>
              {pending.payload.content && (
                <p className="font-ui text-sm text-body line-clamp-3">{pending.payload.content}</p>
              )}
              {pending.images.length > 0 && (
                <p className="font-ui text-xs text-caption">
                  {pending.images.length} {pending.images.length === 1 ? 'photo' : 'photos'} pending upload
                </p>
              )}
            </div>
          </div>
        ))}

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
                {group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    tripId={tripId!}
                    currentUserId={user?.id ?? ''}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          allEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              tripId={tripId!}
              currentUserId={user?.id ?? ''}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" data-testid="scroll-sentinel" />

        {isFetchingNextPage && (
          <p className="font-ui text-xs text-caption text-center py-2">{t('common.loading')}</p>
        )}
      </main>

      <BottomNavBar {...(tripId !== undefined && { tripId })} {...(tripRole !== undefined && { tripRole })} />
    </div>
  );
}
