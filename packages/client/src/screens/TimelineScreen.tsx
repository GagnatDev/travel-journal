import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Entry, Trip } from '@travel-journal/shared';

import type { EntriesPage } from '../api/entries.js';
import { deleteEntry, fetchEntriesPage } from '../api/entries.js';
import { fetchTrip } from '../api/trips.js';
import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { EntryCard } from '../components/EntryCard.js';

export function TimelineScreen() {
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

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

  return (
    <div className="min-h-screen bg-bg-primary pb-28">
      <header className="px-4 pt-8 pb-4">
        <h1 className="font-display text-2xl text-heading">{trip?.name ?? ''}</h1>
      </header>

      <main className="px-4 space-y-4">
        {allEntries.length === 0 ? (
          <p className="font-ui text-body text-center py-12 text-caption">
            {t('entries.emptyState')}
          </p>
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
