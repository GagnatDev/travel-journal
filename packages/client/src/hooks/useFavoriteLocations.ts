import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntryLocation } from '@travel-journal/shared';

import {
  createSavedLocation,
  deleteSavedLocation,
  fetchSavedLocations,
  type SavedLocationResponse,
} from '../api/savedLocations.js';
import { useAuth } from '../context/AuthContext.js';
import { QUERY_STALE_MS } from '../lib/appQueryClient.js';

export const savedLocationsQueryKey = (tripId: string | undefined) =>
  ['savedLocations', tripId] as const;

/**
 * Favorite locations for a trip — saved locations flagged `isFavorite`. Unlike
 * one-shot map bookmarks, favorites are reusable: composing an entry from one
 * never consumes it. Favoriting an entry's location copies its coordinates into
 * a favorite; entry cards match favorites back to entries by exact lat/lng.
 */
export function useFavoriteLocations(tripId: string | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: savedLocationsQueryKey(tripId),
    queryFn: () => fetchSavedLocations(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
    staleTime: QUERY_STALE_MS.savedLocations,
  });

  const favorites = useMemo(() => (data ?? []).filter((l) => l.isFavorite), [data]);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: savedLocationsQueryKey(tripId) }),
      queryClient.invalidateQueries({ queryKey: ['mapPins', tripId] }),
    ]);
  }, [queryClient, tripId]);

  const addMutation = useMutation({
    mutationFn: (location: EntryLocation) =>
      createSavedLocation(
        tripId!,
        {
          lat: location.lat,
          lng: location.lng,
          ...(location.name !== undefined && location.name.trim() !== '' && {
            name: location.name.trim(),
          }),
          isFavorite: true,
        },
        accessToken!,
      ),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (savedId: string) => deleteSavedLocation(tripId!, savedId, accessToken!),
    onSuccess: invalidate,
  });

  const findFavoriteFor = useCallback(
    (location: { lat: number; lng: number } | undefined): SavedLocationResponse | undefined =>
      location === undefined
        ? undefined
        : favorites.find((f) => f.lat === location.lat && f.lng === location.lng),
    [favorites],
  );

  return {
    favorites,
    findFavoriteFor,
    addFavorite: addMutation.mutate,
    removeFavorite: removeMutation.mutate,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}
