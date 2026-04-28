import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

import { useAuth } from '../context/AuthContext.js';
import { BottomNavBar } from '../components/BottomNavBar.js';

import { TripDeleteSection } from './tripSettings/TripDeleteSection.js';
import { TripDetailsSection } from './tripSettings/TripDetailsSection.js';
import { TripMembersSection } from './tripSettings/TripMembersSection.js';
import { TripStatusSection } from './tripSettings/TripStatusSection.js';
import {
  canAccessTripSettingsScreen,
  canDeleteTrip,
  canDownloadTripPhotobookPdf,
  canEditTripDetailsAndLifecycle,
  canManageTripInvitesAndMembers,
  canUseTripInviteActions,
  viewerTripRoleForUser,
} from './tripSettings/tripSettingsPermissions.js';
import { TripPhotobookPdfSection } from './tripSettings/TripPhotobookPdfSection.js';
import { useTripSettings } from './tripSettings/useTripSettings.js';

export function TripSettingsScreen() {
  const { t } = useTranslation();
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'contributor' | 'follower'>('follower');
  const [addMemberResult, setAddMemberResult] = useState<{
    type: 'added' | 'invite_created';
    inviteLink?: string;
  } | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  const {
    trip,
    isLoading,
    pendingInvites,
    inviteSuggestions,
    updateMutation,
    statusMutation,
    deleteMutation,
    addMemberMutation,
    changeRoleMutation,
    removeMemberMutation,
    revokeInviteMutation,
    refetchTrip,
  } = useTripSettings({
    tripId,
    accessToken,
    userId: user?.id,
    addMemberInput,
    addMemberRole,
    onAddTripMemberSuccess: (data) => {
      setAddMemberResult(data);
      setAddMemberInput('');
    },
    onRemoveTripMemberSuccess: () => setMemberToRemove(null),
  });

  useEffect(() => {
    if (!trip) return;
    setName(trip.name);
    setDescription(trip.description ?? '');
  }, [trip?.id]);

  const myMember = trip?.members.find((m) => m.userId === user?.id);
  const myRole = viewerTripRoleForUser(trip, user?.id);

  useEffect(() => {
    if (trip && !canAccessTripSettingsScreen(myRole)) {
      navigate(`/trips/${tripId}/timeline`);
    }
  }, [trip, myRole, navigate, tripId]);

  if (isLoading || !trip) {
    return null;
  }

  if (!canAccessTripSettingsScreen(myRole)) {
    return null;
  }

  if (!myMember) {
    return null;
  }

  const canManageMembers = canManageTripInvitesAndMembers(myRole);
  const canUseInvites = canUseTripInviteActions(trip, myRole);

  return (
    <div className="min-h-screen bg-bg-primary pt-14 pb-28">
      <header className="px-4 pt-4 pb-4">
        <h1 className="font-display text-2xl text-heading">{t('trips.settings.title')}</h1>
      </header>

      <main className="px-4 space-y-8">
        {canEditTripDetailsAndLifecycle(myRole) ? (
          <TripDetailsSection
            t={t}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            updateMutation={updateMutation}
          />
        ) : null}
        {canEditTripDetailsAndLifecycle(myRole) ? (
          <TripStatusSection t={t} tripStatus={trip.status} statusMutation={statusMutation} />
        ) : null}
        {accessToken && canDownloadTripPhotobookPdf(myRole, trip.status) ? (
          <TripPhotobookPdfSection
            t={t}
            trip={trip}
            accessToken={accessToken}
            pdfUiLanguage={i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'nb'}
            refetchTrip={() => void refetchTrip()}
          />
        ) : null}
        <TripMembersSection
          t={t}
          trip={trip}
          canManageMembers={canManageMembers}
          canUseInvites={canUseInvites}
          pendingInvites={pendingInvites}
          inviteSuggestions={inviteSuggestions}
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
          updateTripMutation={updateMutation}
        />
        {canDeleteTrip(myRole) ? (
          <TripDeleteSection
            t={t}
            showDeleteConfirm={showDeleteConfirm}
            setShowDeleteConfirm={setShowDeleteConfirm}
            deleteMutation={deleteMutation}
          />
        ) : null}
      </main>

      {tripId !== undefined && myRole !== undefined && (
        <BottomNavBar tripId={tripId} tripRole={myRole} />
      )}
    </div>
  );
}
