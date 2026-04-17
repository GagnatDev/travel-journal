import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { apiJson } from '../../api/client.js';
import { SettingsListRow } from '../../components/SettingsListRow.js';

import type { AdminUser } from './types.js';

interface AdminUsersTabProps {
  token: string;
}

export function AdminUsersTab({ token }: AdminUsersTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => apiJson<AdminUser[]>('/api/v1/users', { token }),
    enabled: !!token,
    refetchOnWindowFocus: true,
  });

  const promoteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiJson<AdminUser>(`/api/v1/users/${userId}/promote`, { method: 'PATCH', token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return (
    <section className="space-y-3">
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide">
        {t('admin.users.title')}
      </h2>
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
                  u.appRole === 'follower' ? (
                    <button
                      type="button"
                      onClick={() => promoteMutation.mutate(u.id)}
                      disabled={promoteMutation.isPending}
                      className="px-3 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded-round-eight hover:bg-accent hover:text-white transition-all disabled:opacity-50"
                    >
                      {t('admin.users.promoteButton')}
                    </button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
