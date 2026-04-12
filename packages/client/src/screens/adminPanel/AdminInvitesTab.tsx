import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Invite } from '@travel-journal/shared';

import { apiJson } from '../../api/client.js';
import { HourglassIcon } from '../../components/icons/index.js';
import { CopyableLinkField } from '../../components/CopyableLinkField.js';
import { PillButton } from '../../components/ui/PillButton.js';
import { TextField } from '../../components/ui/TextField.js';

interface AdminInvitesTabProps {
  token: string;
}

export function AdminInvitesTab({ token }: AdminInvitesTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'creator' | 'follower'>('follower');
  const [generatedLink, setGeneratedLink] = useState('');

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ['admin-invites'],
    queryFn: () => apiJson<Invite[]>('/api/v1/invites/platform?status=pending', { token }),
    enabled: !!token,
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const data = await apiJson<{ invite: Invite; inviteLink: string }>('/api/v1/invites/platform', {
        method: 'POST',
        token,
        body: { email: inviteEmail, assignedAppRole: inviteRole },
      });
      return data;
    },
    onSuccess: (data) => {
      setGeneratedLink(window.location.origin + data.inviteLink);
      setInviteEmail('');
      void queryClient.invalidateQueries({ queryKey: ['admin-invites'] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiJson<void>(`/api/v1/invites/platform/${inviteId}`, { method: 'DELETE', token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-invites'] });
    },
  });

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createInviteMutation.mutate();
          }}
          className="space-y-3"
        >
          <TextField
            label={t('admin.invite.emailLabel')}
            labelHtmlFor="invite-email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <div>
            <label htmlFor="invite-role" className="block font-ui text-sm font-medium text-body mb-1">
              {t('admin.invite.roleLabel')}
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'creator' | 'follower')}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="follower">{t('admin.invite.roles.follower')}</option>
              <option value="creator">{t('admin.invite.roles.creator')}</option>
            </select>
          </div>
          <PillButton type="submit" disabled={createInviteMutation.isPending}>
            {t('admin.invite.submitButton')}
          </PillButton>
        </form>

        {generatedLink ? (
          <CopyableLinkField
            value={generatedLink}
            fieldLabel={t('admin.invite.linkLabel')}
            inputAriaLabel={t('admin.invite.linkLabel')}
            copyLabel={t('admin.invite.copyButton')}
            copiedLabel={t('admin.invite.linkCopied')}
            errorLabel={t('common.copyFailed')}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide">
          {t('admin.invite.pendingTitle')}
        </h2>
        {invites.length === 0 ? (
          <p className="font-ui text-sm text-caption">{t('admin.invite.noInvites')}</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li key={inv.id}>
                <div className="border-2 border-dashed border-caption/40 rounded-card p-4 flex items-center gap-3">
                  <HourglassIcon width={18} height={18} className="text-caption shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-ui text-sm font-medium text-body truncate">{inv.email}</p>
                    <p className="font-ui text-xs text-caption">
                      {inv.assignedAppRole} · {t('admin.invite.expiry')}{' '}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeInviteMutation.mutate(inv.id)}
                    disabled={revokeInviteMutation.isPending}
                    className="font-ui text-xs font-semibold text-accent uppercase shrink-0 hover:opacity-70 disabled:opacity-50 transition-opacity"
                  >
                    {t('admin.invite.revokeButton')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
