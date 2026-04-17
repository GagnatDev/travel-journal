import { QueryClient } from '@tanstack/react-query';

/**
 * Per-query `staleTime` values (ms) for TanStack Query.
 *
 * Rationale (issue #43): the library defaults `staleTime: 0`, so cached data is immediately stale.
 * That triggers refetches on **window focus** and on **component remount**, which is noisy for
 * stable screens (trip list, timeline shell) and costs network/battery. Mutations, offline sync,
 * and explicit `invalidateQueries` still mark queries stale and refetch regardless of these windows.
 *
 * - **trips**: The list changes rarely compared to entries; a longer window avoids duplicate
 *   `fetchTrips` when navigating away and back quickly.
 * - **trip detail**: Metadata and membership change less often than the journal; invalidations
 *   cover saves from settings.
 * - **entries feed**: Shorter window balances multi-user freshness (new posts) with avoiding
 *   refetch spam when flipping between timeline and map on the same trip.
 */
export const QUERY_STALE_MS = {
  trips: 5 * 60 * 1000,
  tripDetail: 2 * 60 * 1000,
  entriesFeed: 45 * 1000,
  entryLocations: 45 * 1000,
  entryEditor: 2 * 60 * 1000,
} as const;

/**
 * Factory for the root {@link QueryClient}.
 *
 * Globally we disable `refetchOnWindowFocus` so returning to the app does not refetch every
 * mounted query. **Admin** queries opt back into focus refetch so moderator views stay fresh.
 * `refetchOnReconnect` stays enabled (default) so coming online after offline still refreshes.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS.tripDetail,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
