import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { apiJson } from '../../api/client.js';
import { CopyableLinkField } from '../../components/CopyableLinkField.js';
import { SettingsListRow } from '../../components/SettingsListRow.js';
import type { AdminUser } from './types.js';

interface AdminUsersTabProps {
  token: string;
}

export function AdminUsersTab({ token }: AdminUsersTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [generatedLink, setGeneratedLink] = useState('');

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => apiJson<AdminUser[]>('/api/v1/users', { token }),
    enabled: !!token,
    refetchOnWindowFocus: true,
    // Tab switch remounts this panel; window focus alone does not run when staying in-app.
    refetchOnMount: 'always',
  });

  const promoteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiJson<AdminUser>(`/api/v1/users/${userId}/promote`, { method: 'PATCH', token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const resetLinkMutation = useMutation({
    mutationFn: async (userId: string) => {
      const data = await apiJson<{ resetLink: string }>(`/api/v1/users/${userId}/password-reset-link`, {
        method: 'POST',
        token,
      });
      return data;
    },
    onSuccess: (data) => {
      setGeneratedLink(window.location.origin + data.resetLink);
    },
  });

  return (
    <section className="space-y-3">
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide">
        {t('admin.users.title')}
      </h2>
      {generatedLink ? (
        <CopyableLinkField
          value={generatedLink}
          fieldLabel={t('admin.users.resetPasswordLinkLabel')}
          inputAriaLabel={t('admin.users.resetPasswordLinkLabel')}
          copyLabel={t('admin.invite.copyButton')}
          copiedLabel={t('admin.invite.linkCopied')}
          errorLabel={t('common.copyFailed')}
        />
      ) : null}
      {users.length === 0 ? (
        <p className="font-ui text-sm text-caption">{t('admin.users.noUsers')}</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id}>
              <SettingsListRow
                main={
                  <div>
                    <p className="font-ui text-sm font-medium text-body">{u.displayName}</p>
                    <p className="font-ui text-xs text-caption">{u.email}</p>
                    <p className="font-ui text-xs text-caption">{u.appRole}</p>
                  </div>
                }
                actions={
                  <div className="flex flex-col gap-2 items-end">
                    <button
                      type="button"
                      onClick={() => resetLinkMutation.mutate(u.id)}
                      disabled={resetLinkMutation.isPending}
                      className="px-3 py-1 border border-caption text-caption font-ui text-xs font-semibold rounded-round-eight hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                    >
                      {t('admin.users.resetPasswordButton')}
                    </button>
                    {u.appRole === 'follower' ? (
                      <button
                        type="button"
                        onClick={() => promoteMutation.mutate(u.id)}
                        disabled={promoteMutation.isPending}
                        className="px-3 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded-round-eight hover:bg-accent hover:text-white transition-all disabled:opacity-50"
                      >
                        {t('admin.users.promoteButton')}
                      </button>
                    ) : null}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
