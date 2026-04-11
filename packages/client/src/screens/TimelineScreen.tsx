import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Entry, Trip } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { EntryCard } from '../components/EntryCard.js';

interface EntriesPage {
  entries: Entry[];
  total: number;
}

async function fetchEntriesPage(
  tripId: string,
  page: number,
  accessToken: string,
): Promise<EntriesPage> {
  const res = await fetch(`/api/v1/trips/${tripId}/entries?page=${page}&limit=20`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch entries');
  return res.json() as Promise<EntriesPage>;
}

async function fetchTrip(tripId: string, accessToken: string): Promise<Trip> {
  const res = await fetch(`/api/v1/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch trip');
  return res.json() as Promise<Trip>;
}

async function deleteEntryRequest(
  tripId: string,
  entryId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`/api/v1/trips/${tripId}/entries/${entryId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to delete entry');
}

export function TimelineScreen() {
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const {
    data: tripData,
  } = useInfiniteQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId!, accessToken!),
    getNextPageParam: () => undefined,
    enabled: !!accessToken && !!tripId,
    initialPageParam: 1,
  });

  const trip = tripData?.pages[0] ?? null;
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
    mutationFn: (entryId: string) => deleteEntryRequest(tripId!, entryId, accessToken!),
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
