import type { UseMutationResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { Invite, Trip } from '@travel-journal/shared';

import type { AddTripMemberResult } from '../../api/trips.js';
import { CopyableLinkField } from '../../components/CopyableLinkField.js';
import { standardTextControlClass } from '../../components/ui/fieldStyles.js';
import { SettingsListRow } from '../../components/SettingsListRow.js';

interface TripMembersSectionProps {
  t: TFunction;
  trip: Trip;
  pendingInvites: Invite[];
  addMemberInput: string;
  setAddMemberInput: (v: string) => void;
  addMemberRole: 'contributor' | 'follower';
  setAddMemberRole: (v: 'contributor' | 'follower') => void;
  addMemberResult: AddTripMemberResult | null;
  setAddMemberResult: (v: AddTripMemberResult | null) => void;
  memberToRemove: string | null;
  setMemberToRemove: (v: string | null) => void;
  addMemberMutation: UseMutationResult<AddTripMemberResult, Error, void, unknown>;
  changeRoleMutation: UseMutationResult<
    void,
    Error,
    { userId: string; tripRole: 'contributor' | 'follower' },
    unknown
  >;
  removeMemberMutation: UseMutationResult<void, Error, string, unknown>;
  revokeInviteMutation: UseMutationResult<void, Error, string, unknown>;
}

export function TripMembersSection({
  t,
  trip,
  pendingInvites,
  addMemberInput,
  setAddMemberInput,
  addMemberRole,
  setAddMemberRole,
  addMemberResult,
  setAddMemberResult,
  memberToRemove,
  setMemberToRemove,
  addMemberMutation,
  changeRoleMutation,
  removeMemberMutation,
  revokeInviteMutation,
}: TripMembersSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide">
        {t('trips.settings.membersTitle')}
      </h2>

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
                          type="button"
                          onClick={() => removeMemberMutation.mutate(member.userId)}
                          disabled={removeMemberMutation.isPending}
                          className="px-2 py-1 bg-accent text-white font-ui text-xs rounded"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMemberToRemove(null)}
                          className="px-2 py-1 border border-caption text-caption font-ui text-xs rounded"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
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

      <div className="space-y-2">
        <h3 className="font-ui text-sm font-medium text-body">{t('trips.settings.addMemberTitle')}</h3>
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
                className={`flex-1 min-w-0 text-sm ${standardTextControlClass}`}
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
                      type="button"
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
  );
}
