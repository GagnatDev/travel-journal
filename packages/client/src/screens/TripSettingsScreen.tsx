import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';
import { getPushPermissionState } from '../notifications/push.js';

import { TripDeleteSection } from './tripSettings/TripDeleteSection.js';
import { TripDetailsSection } from './tripSettings/TripDetailsSection.js';
import { TripMembersSection } from './tripSettings/TripMembersSection.js';
import { TripStatusSection } from './tripSettings/TripStatusSection.js';
import { useTripSettings } from './tripSettings/useTripSettings.js';

export function TripSettingsScreen() {
  const { t } = useTranslation();
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();

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

  const {
    trip,
    isLoading,
    pendingInvites,
    updateMutation,
    statusMutation,
    deleteMutation,
    addMemberMutation,
    changeRoleMutation,
    removeMemberMutation,
    revokeInviteMutation,
    updateMyNotificationPreferencesMutation,
  } = useTripSettings({
    tripId,
    accessToken,
    t,
    addMemberInput,
    addMemberRole,
    setPushPermissionState,
    onAddTripMemberSuccess: (data) => {
      setAddMemberResult(data);
      setAddMemberInput('');
    },
    onRemoveTripMemberSuccess: () => setMemberToRemove(null),
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
