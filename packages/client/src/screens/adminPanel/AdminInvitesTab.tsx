import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Invite } from '@travel-journal/shared';

import { apiJson } from '../../api/client.js';
import { CopyableLinkField } from '../../components/CopyableLinkField.js';
import { TextField } from '../../components/ui/TextField.js';
import { SettingsListRow } from '../../components/SettingsListRow.js';

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
          <button
            type="submit"
            disabled={createInviteMutation.isPending}
            className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {t('admin.invite.submitButton')}
          </button>
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
                <SettingsListRow
                  main={
                    <div>
                      <p className="font-ui text-sm font-medium text-body">{inv.email}</p>
                      <p className="font-ui text-xs text-caption">
                        {inv.assignedAppRole} · {t('admin.invite.expiry')}{' '}
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={() => revokeInviteMutation.mutate(inv.id)}
                      disabled={revokeInviteMutation.isPending}
                      className="px-3 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded-round-eight hover:bg-accent hover:text-white transition-all disabled:opacity-50"
                    >
                      {t('admin.invite.revokeButton')}
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
