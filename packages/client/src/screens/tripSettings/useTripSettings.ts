import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TripStatus } from '@travel-journal/shared';

import type { AddTripMemberResult } from '../../api/trips.js';
import {
  addTripMember,
  deleteTrip,
  fetchTrip,
  fetchTripInvites,
  fetchTripMemberInviteSuggestions,
  patchTrip,
  patchTripMemberRole,
  patchTripStatus,
  removeTripMember,
  revokeTripMemberInvite,
} from '../../api/trips.js';
import { QUERY_STALE_MS } from '../../lib/appQueryClient.js';
import { canUseTripInviteActions, viewerTripRoleForUser } from './tripSettingsPermissions.js';

/** React Query keys shared by trip settings queries and invalidations. */
export const tripSettingsQueryKeys = {
  trips: ['trips'] as const,
  trip: (tripId: string | undefined) => ['trip', tripId] as const,
  tripInvites: (tripId: string | undefined) => ['trip-invites', tripId] as const,
  tripInviteSuggestions: (tripId: string | undefined) =>
    ['trip-invite-suggestions', tripId] as const,
};

type UseTripSettingsParams = {
  tripId: string | undefined;
  accessToken: string | null | undefined;
  userId: string | undefined;
  addMemberInput: string;
  addMemberRole: 'contributor' | 'follower';
  onAddTripMemberSuccess: (data: AddTripMemberResult) => void;
  onRemoveTripMemberSuccess: () => void;
};

export function useTripSettings({
  tripId,
  accessToken,
  userId,
  addMemberInput,
  addMemberRole,
  onAddTripMemberSuccess,
  onRemoveTripMemberSuccess,
}: UseTripSettingsParams) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: trip, isLoading, refetch: refetchTrip } = useQuery({
    queryKey: tripSettingsQueryKeys.trip(tripId),
    queryFn: () => fetchTrip(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
    staleTime: QUERY_STALE_MS.tripDetail,
  });

  const viewerRole = viewerTripRoleForUser(trip, userId);

  const canFetchInvites =
    !!tripId && !!accessToken && !!trip && canUseTripInviteActions(trip, viewerRole);

  const { data: pendingInvites = [] } = useQuery({
    queryKey: tripSettingsQueryKeys.tripInvites(tripId),
    queryFn: () => fetchTripInvites(tripId!, accessToken!),
    enabled: canFetchInvites,
    staleTime: QUERY_STALE_MS.tripDetail,
  });

  const { data: inviteSuggestions = [] } = useQuery({
    queryKey: tripSettingsQueryKeys.tripInviteSuggestions(tripId),
    queryFn: () => fetchTripMemberInviteSuggestions(tripId!, accessToken!),
    enabled: canFetchInvites,
    staleTime: QUERY_STALE_MS.tripDetail,
  });

  const invalidateTripListsAndDetail = () => {
    void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trips });
    void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trip(tripId) });
  };

  const updateMutation = useMutation({
    mutationFn: (data: {
      name?: string;
      description?: string;
      allowContributorInvites?: boolean;
    }) => patchTrip(tripId!, data, accessToken!),
    onSuccess: invalidateTripListsAndDetail,
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: TripStatus) => patchTripStatus(tripId!, newStatus, accessToken!),
    onSuccess: invalidateTripListsAndDetail,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTrip(tripId!, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trips });
      navigate('/trips');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addTripMember(
        tripId!,
        { emailOrNickname: addMemberInput, tripRole: addMemberRole },
        accessToken!,
      ),
    onSuccess: (data) => {
      onAddTripMemberSuccess(data);
      void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.tripInvites(tripId) });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, tripRole }: { userId: string; tripRole: 'contributor' | 'follower' }) =>
      patchTripMemberRole(tripId!, userId, tripRole, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trip(tripId) });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTripMember(tripId!, userId, accessToken!),
    onSuccess: () => {
      onRemoveTripMemberSuccess();
      void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trip(tripId) });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => revokeTripMemberInvite(tripId!, inviteId, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.tripInvites(tripId) });
    },
  });

  return {
    trip,
    isLoading,
    refetchTrip,
    pendingInvites,
    inviteSuggestions,
    updateMutation,
    statusMutation,
    deleteMutation,
    addMemberMutation,
    changeRoleMutation,
    removeMemberMutation,
    revokeInviteMutation,
  };
}
