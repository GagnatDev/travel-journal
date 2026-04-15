import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TripStatus } from '@travel-journal/shared';

import {
  addTripMember,
  deleteTrip,
  fetchTrip,
  fetchTripInvites,
  patchMyTripNotificationPreferences,
  patchTrip,
  patchTripMemberRole,
  patchTripStatus,
  removeTripMember,
  revokeTripMemberInvite,
} from '../api/trips.js';
import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { ensurePushSubscription, getPushPermissionState } from '../notifications/push.js';

import { TripDeleteSection } from './tripSettings/TripDeleteSection.js';
import { TripDetailsSection } from './tripSettings/TripDetailsSection.js';
import { TripMembersSection } from './tripSettings/TripMembersSection.js';
import { TripStatusSection } from './tripSettings/TripStatusSection.js';

export function TripSettingsScreen() {
  const { t } = useTranslation();
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState('');

  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'contributor' | 'follower'>('follower');
  const [addMemberResult, setAddMemberResult] = useState<{
    type: 'added' | 'invite_created';
    inviteLink?: string;
  } | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [pushPermissionState, setPushPermissionState] = useState(getPushPermissionState());

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ['trip-invites', tripId],
    queryFn: () => fetchTripInvites(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken && !!trip,
  });

  useEffect(() => {
    if (!trip) return;
    setName(trip.name);
  }, [trip?.id]);

  useEffect(() => {
    function refreshPermission() {
      setPushPermissionState(getPushPermissionState());
    }
    window.addEventListener('focus', refreshPermission);
    return () => window.removeEventListener('focus', refreshPermission);
  }, []);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string }) => patchTrip(tripId!, data, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: TripStatus) => patchTripStatus(tripId!, newStatus, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTrip(tripId!, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
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
      setAddMemberResult(data);
      setAddMemberInput('');
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      void queryClient.invalidateQueries({ queryKey: ['trip-invites', tripId] });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, tripRole }: { userId: string; tripRole: 'contributor' | 'follower' }) =>
      patchTripMemberRole(tripId!, userId, tripRole, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTripMember(tripId!, userId, accessToken!),
    onSuccess: () => {
      setMemberToRemove(null);
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => revokeTripMemberInvite(tripId!, inviteId, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-invites', tripId] });
    },
  });

  const updateMyNotificationPreferencesMutation = useMutation({
    mutationFn: async (newEntriesPushEnabled: boolean) => {
      if (newEntriesPushEnabled) {
        const permission = await ensurePushSubscription(accessToken!);
        setPushPermissionState(permission);
        if (permission !== 'granted') {
          throw new Error(t('trips.settings.notificationsPermissionRequired'));
        }
      }
      return patchMyTripNotificationPreferences(
        tripId!,
        { newEntriesPushEnabled },
        accessToken!,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const myMember = trip?.members.find((m) => m.userId === user?.id);
  const isCreator = !!myMember && myMember.tripRole === 'creator';

  useEffect(() => {
    if (trip && !isCreator) {
      navigate(`/trips/${tripId}/timeline`);
    }
  }, [trip, isCreator, navigate, tripId]);

  if (isLoading || !trip) {
    return null;
  }

  if (!isCreator) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bg-primary pt-14 pb-28">
      <header className="px-4 pt-4 pb-4">
        <h1 className="font-display text-2xl text-heading">{t('trips.settings.title')}</h1>
      </header>

      <main className="px-4 space-y-8">
        <TripDetailsSection t={t} name={name} setName={setName} updateMutation={updateMutation} />
        <TripStatusSection t={t} tripStatus={trip.status} statusMutation={statusMutation} />
        <TripMembersSection
          t={t}
          trip={trip}
          pendingInvites={pendingInvites}
          addMemberInput={addMemberInput}
          setAddMemberInput={setAddMemberInput}
          addMemberRole={addMemberRole}
          setAddMemberRole={setAddMemberRole}
          addMemberResult={addMemberResult}
          setAddMemberResult={setAddMemberResult}
          memberToRemove={memberToRemove}
          setMemberToRemove={setMemberToRemove}
          addMemberMutation={addMemberMutation}
          changeRoleMutation={changeRoleMutation}
          removeMemberMutation={removeMemberMutation}
          revokeInviteMutation={revokeInviteMutation}
          myMember={myMember}
          pushPermissionState={pushPermissionState}
          updateMyNotificationPreferencesMutation={updateMyNotificationPreferencesMutation}
        />
        <TripDeleteSection
          t={t}
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          deleteMutation={deleteMutation}
        />
      </main>

      {tripId !== undefined && <BottomNavBar tripId={tripId} tripRole="creator" />}
    </div>
  );
}
