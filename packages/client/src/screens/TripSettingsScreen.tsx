import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Trip, TripStatus } from '@travel-journal/shared';

import { apiJson } from '../api/client.js';
import { fetchTrip, fetchTripInvites } from '../api/trips.js';
import { CopyableLinkField } from '../components/CopyableLinkField.js';
import { SettingsListRow } from '../components/SettingsListRow.js';
import { useAuth } from '../context/AuthContext.js';

export function TripSettingsScreen() {
  const { t } = useTranslation();
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [hasLoadedName, setHasLoadedName] = useState(false);

  // Member management state
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'contributor' | 'follower'>('follower');
  const [addMemberResult, setAddMemberResult] = useState<{
    type: 'added' | 'invite_created';
    inviteLink?: string;
  } | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

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

  // Set name once on first load
  if (trip && !hasLoadedName) {
    setName(trip.name);
    setHasLoadedName(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string }) =>
      apiJson<Trip>(`/api/v1/trips/${tripId}`, {
        method: 'PATCH',
        token: accessToken!,
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: TripStatus) =>
      apiJson<Trip>(`/api/v1/trips/${tripId}/status`, {
        method: 'PATCH',
        token: accessToken!,
        body: { status: newStatus },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiJson<void>(`/api/v1/trips/${tripId}`, {
        method: 'DELETE',
        token: accessToken!,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      navigate('/trips');
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () =>
      apiJson<{ type: 'added' | 'invite_created'; inviteLink?: string }>(
        `/api/v1/trips/${tripId}/members`,
        {
          method: 'POST',
          token: accessToken!,
          body: { emailOrNickname: addMemberInput, tripRole: addMemberRole },
        },
      ),
    onSuccess: (data) => {
      setAddMemberResult(data);
      setAddMemberInput('');
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      void queryClient.invalidateQueries({ queryKey: ['trip-invites', tripId] });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, tripRole }: { userId: string; tripRole: 'contributor' | 'follower' }) => {
      await apiJson<void>(`/api/v1/trips/${tripId}/members/${userId}/role`, {
        method: 'PATCH',
        token: accessToken!,
        body: { tripRole },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiJson<void>(`/api/v1/trips/${tripId}/members/${userId}`, {
        method: 'DELETE',
        token: accessToken!,
      });
    },
    onSuccess: () => {
      setMemberToRemove(null);
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiJson<void>(`/api/v1/trips/${tripId}/members/invites/${inviteId}`, {
        method: 'DELETE',
        token: accessToken!,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-invites', tripId] });
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
    <div className="min-h-screen bg-bg-primary pb-24">
      <header className="px-4 pt-8 pb-4">
        <button onClick={() => navigate(-1)} className="font-ui text-sm text-caption mb-2">
          ← Back
        </button>
        <h1 className="font-display text-2xl text-heading">{t('trips.settings.title')}</h1>
      </header>

      <main className="px-4 space-y-8">
        {/* Trip Details */}
        <section>
          <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
            {t('trips.settings.detailsTitle')}
          </h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="settings-name" className="block font-ui text-sm font-medium text-body mb-1">
                {t('trips.create.nameLabel')}
              </label>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button
              onClick={() => updateMutation.mutate({ name })}
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </section>

        {/* Status Management */}
        <section>
          <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
            {t('trips.settings.statusTitle')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {trip.status === 'planned' && (
              <button
                onClick={() => statusMutation.mutate('active')}
                disabled={statusMutation.isPending}
                className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
              >
                {t('trips.settings.markActive')}
              </button>
            )}
            {trip.status === 'active' && (
              <button
                onClick={() => statusMutation.mutate('completed')}
                disabled={statusMutation.isPending}
                className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
              >
                {t('trips.settings.markCompleted')}
              </button>
            )}
            {trip.status === 'completed' && (
              <button
                onClick={() => statusMutation.mutate('active')}
                disabled={statusMutation.isPending}
                className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
              >
                {t('trips.settings.reopen')}
              </button>
            )}
          </div>
        </section>

        {/* Member Management */}
        <section className="space-y-4">
          <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide">
            {t('trips.settings.membersTitle')}
          </h2>

          {/* Current members list */}
          <ul className="space-y-2">
            {trip.members.map((member) => (
              <li key={member.userId}>
                <SettingsListRow
                  main={
                    <div>
                      <p className="font-ui text-sm font-medium text-body">{member.displayName}</p>
                      <p className="font-ui text-xs text-caption">{t(`trips.role.${member.tripRole}`)}</p>
                    </div>
                  }
                  actions={
                    member.tripRole !== 'creator' ? (
                      <>
                        <select
                          value={member.tripRole}
                          onChange={(e) =>
                            changeRoleMutation.mutate({
                              userId: member.userId,
                              tripRole: e.target.value as 'contributor' | 'follower',
                            })
                          }
                          aria-label={`${member.displayName} ${t('trips.settings.addMemberRoleLabel')}`}
                          className="text-xs px-2 py-1 border border-caption rounded font-ui bg-bg-primary text-body"
                        >
                          <option value="contributor">{t('trips.role.contributor')}</option>
                          <option value="follower">{t('trips.role.follower')}</option>
                        </select>
                        {memberToRemove === member.userId ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => removeMemberMutation.mutate(member.userId)}
                              disabled={removeMemberMutation.isPending}
                              className="px-2 py-1 bg-accent text-white font-ui text-xs rounded"
                            >
                              {t('common.confirm')}
                            </button>
                            <button
                              onClick={() => setMemberToRemove(null)}
                              className="px-2 py-1 border border-caption text-caption font-ui text-xs rounded"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setMemberToRemove(member.userId)}
                            className="px-2 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded hover:bg-accent hover:text-white transition-all"
                          >
                            {t('trips.settings.removeButton')}
                          </button>
                        )}
                      </>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>

          {/* Add member */}
          <div className="space-y-2">
            <h3 className="font-ui text-sm font-medium text-body">
              {t('trips.settings.addMemberTitle')}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAddMemberResult(null);
                addMemberMutation.mutate();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={addMemberInput}
                onChange={(e) => setAddMemberInput(e.target.value)}
                placeholder={t('trips.settings.addMemberPlaceholder')}
                required
                className="flex-1 px-3 py-2 border border-caption rounded-round-eight font-ui text-sm text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <select
                value={addMemberRole}
                onChange={(e) => setAddMemberRole(e.target.value as 'contributor' | 'follower')}
                className="px-2 py-2 border border-caption rounded-round-eight font-ui text-sm bg-bg-secondary text-body"
              >
                <option value="follower">{t('trips.role.follower')}</option>
                <option value="contributor">{t('trips.role.contributor')}</option>
              </select>
              <button
                type="submit"
                disabled={addMemberMutation.isPending}
                className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {t('trips.settings.addMemberButton')}
              </button>
            </form>

            {addMemberResult?.type === 'added' && (
              <p className="font-ui text-sm text-green-600">{t('trips.settings.memberAdded')}</p>
            )}

            {addMemberResult?.type === 'invite_created' && addMemberResult.inviteLink ? (
              <CopyableLinkField
                value={window.location.origin + addMemberResult.inviteLink}
                description={t('trips.settings.inviteLinkGenerated')}
                inputAriaLabel={t('trips.settings.inviteLinkGenerated')}
                copyLabel={t('trips.settings.copyLink')}
                copiedLabel={t('trips.settings.linkCopied')}
                errorLabel={t('common.copyFailed')}
              />
            ) : null}
          </div>

          {/* Pending trip invites */}
          {pendingInvites.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-ui text-sm font-medium text-body">
                {t('trips.settings.pendingInvitesTitle')}
              </h3>
              <ul className="space-y-2">
                {pendingInvites.map((inv) => (
                  <li key={inv.id}>
                    <SettingsListRow
                      density="compact"
                      main={
                        <div>
                          <p className="font-ui text-xs font-medium text-body">{inv.email}</p>
                          <p className="font-ui text-xs text-caption">
                            {inv.tripRole} · {new Date(inv.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                      }
                      actions={
                        <button
                          onClick={() => revokeInviteMutation.mutate(inv.id)}
                          disabled={revokeInviteMutation.isPending}
                          className="px-2 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded hover:bg-accent hover:text-white transition-all"
                        >
                          {t('trips.settings.revokeInviteButton')}
                        </button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Delete */}
        <section>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
            >
              {t('trips.settings.deleteButton')}
            </button>
          ) : (
            <div className="p-4 bg-bg-secondary rounded-round-eight space-y-3">
              <p className="font-ui text-sm text-body">{t('trips.settings.deleteConfirmMessage')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 border border-caption rounded-round-eight font-ui text-sm text-body"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight active:scale-95 transition-all"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
