import { useEffect, useMemo, useRef, useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { Invite, Trip, TripMemberInviteSuggestion } from '@travel-journal/shared';

import type { AddTripMemberResult } from '../../api/trips.js';
import { BookOpenIcon, HourglassIcon, PersonPlusIcon } from '../../components/icons/index.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { InfoBox } from '../../components/ui/InfoBox.js';
import { PillButton } from '../../components/ui/PillButton.js';
import { SectionLabel } from '../../components/ui/SectionLabel.js';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch.js';
import { CopyableLinkField } from '../../components/CopyableLinkField.js';
import { standardTextControlClass } from '../../components/ui/fieldStyles.js';

interface TripMembersSectionProps {
  t: TFunction;
  trip: Trip;
  /** When false, only member-safe UI (e.g. notification preferences) is shown. */
  canManageMembers?: boolean;
  /** Invite form, pending invites, and add-member API (creator or contributor when allowed). */
  canUseInvites?: boolean;
  pendingInvites: Invite[];
  inviteSuggestions?: TripMemberInviteSuggestion[];
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
  /** Same mutation as trip details save (name/description); also used for contributor-invite toggle. */
  updateTripMutation: UseMutationResult<
    Trip,
    Error,
    { name?: string; description?: string; allowContributorInvites?: boolean },
    unknown
  >;
}

export function TripMembersSection({
  t,
  trip,
  canManageMembers = true,
  canUseInvites = false,
  pendingInvites,
  inviteSuggestions = [],
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
  updateTripMutation,
}: TripMembersSectionProps) {
  const [inviteFormOpen, setInviteFormOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredInviteSuggestions = useMemo(() => {
    const q = addMemberInput.trim().toLowerCase();
    const list = inviteSuggestions;
    if (!q) return list.slice(0, 50);
    return list
      .filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [addMemberInput, inviteSuggestions]);

  const openSuggestions = () => {
    if (blurCloseTimer.current) {
      clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
    setSuggestionsOpen(true);
  };

  const scheduleCloseSuggestions = () => {
    blurCloseTimer.current = setTimeout(() => {
      setSuggestionsOpen(false);
      blurCloseTimer.current = null;
    }, 180);
  };

  const pickSuggestion = (s: TripMemberInviteSuggestion) => {
    setAddMemberInput(s.email);
    setSuggestionsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
    };
  }, []);

  const suggestionsListId = `trip-invite-suggestions-list-${trip.id}`;

  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl text-heading">
        {t('trips.settings.circleTitle')}
      </h1>

      {canUseInvites ? (
        <>
          {/* Invite button */}
          <PillButton
            fullWidth
            icon={<PersonPlusIcon width={18} height={18} />}
            onClick={() => setInviteFormOpen((v) => !v)}
          >
            {t('trips.settings.inviteButton')}
          </PillButton>

          {/* Invite form (collapsible) */}
          {inviteFormOpen && (
            <div className="space-y-3 p-4 bg-bg-secondary rounded-card border border-caption/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setAddMemberResult(null);
                  setSuggestionsOpen(false);
                  addMemberMutation.mutate();
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    value={addMemberInput}
                    onChange={(e) => {
                      setAddMemberInput(e.target.value);
                      openSuggestions();
                    }}
                    onFocus={openSuggestions}
                    onBlur={scheduleCloseSuggestions}
                    placeholder={t('trips.settings.addMemberPlaceholder')}
                    required
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={suggestionsOpen && filteredInviteSuggestions.length > 0}
                    aria-controls={suggestionsListId}
                    className={`w-full text-sm ${standardTextControlClass}`}
                  />
                  {suggestionsOpen && filteredInviteSuggestions.length > 0 ? (
                    <ul
                      id={suggestionsListId}
                      role="listbox"
                      className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-round-eight border border-caption/20 bg-bg-primary shadow-lg py-1"
                    >
                      <li className="px-3 py-1.5 font-ui text-xs text-caption border-b border-caption/10">
                        {t('trips.settings.inviteSuggestionsHint')}
                      </li>
                      {filteredInviteSuggestions.map((s) => (
                        <li key={s.userId} role="presentation">
                          <button
                            type="button"
                            role="option"
                            className="w-full text-left px-3 py-2 font-ui text-sm text-body hover:bg-bg-secondary transition-colors"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSuggestion(s)}
                          >
                            <span className="font-medium block truncate">{s.displayName}</span>
                            <span className="text-xs text-caption truncate block">{s.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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
          )}
        </>
      ) : null}

      {/* Current members */}
      <div className="space-y-3">
        <SectionLabel badge={<span>{trip.members.length} {t('trips.settings.membersCountSuffix')}</span>}>
          {t('trips.settings.membersTitle')}
        </SectionLabel>

        <ul className="divide-y divide-caption/10">
          {trip.members.map((member) => (
            <li key={member.userId} className="py-3">
              <div className="flex items-center gap-3">
                <Avatar name={member.displayName} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-ui text-sm font-medium text-body">{member.displayName}</p>
                  <p className="font-ui text-xs text-caption">{t(`trips.role.${member.tripRole}`)}</p>
                </div>
                {canManageMembers && member.tripRole !== 'creator' && (
                  <div className="flex items-center gap-2 shrink-0">
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
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invites */}
      {canUseInvites && pendingInvites.length > 0 && (
        <div className="space-y-3">
          <SectionLabel>{t('trips.settings.pendingInvitesTitle')}</SectionLabel>
          <ul className="space-y-2">
            {pendingInvites.map((inv) => (
              <li key={inv.id}>
                <div className="border-2 border-dashed border-caption/40 rounded-card p-4 flex items-center gap-3">
                  <HourglassIcon width={18} height={18} className="text-caption shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-sm font-medium text-body truncate">{inv.email}</p>
                    <p className="font-ui text-xs text-caption">
                      {inv.tripRole} · {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeInviteMutation.mutate(inv.id)}
                    disabled={revokeInviteMutation.isPending}
                    className="font-ui text-xs font-semibold text-accent uppercase shrink-0 hover:opacity-70 disabled:opacity-50 transition-opacity"
                  >
                    {t('trips.settings.revokeInviteButton')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contributor invite toggle */}
      {canManageMembers ? (
        <ToggleSwitch
          id="allow-contributor-invites"
          checked={trip.allowContributorInvites}
          disabled={updateTripMutation.isPending}
          onChange={(next) => updateTripMutation.mutate({ allowContributorInvites: next })}
          label={t('trips.settings.allowContributorInvites')}
        />
      ) : null}

      {/* Collaborative Chapters info box */}
      <InfoBox icon={<BookOpenIcon width={18} height={18} />}>
        <p className="font-semibold">{t('trips.settings.collaborativeChaptersTitle')}</p>
        <p className="text-caption mt-0.5">{t('trips.settings.collaborativeChaptersInfo')}</p>
      </InfoBox>
    </section>
  );
}
