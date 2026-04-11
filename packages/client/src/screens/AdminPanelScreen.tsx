import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Invite, PublicUser } from '@travel-journal/shared';

import { apiJson } from '../api/client.js';
import { CopyableLinkField } from '../components/CopyableLinkField.js';
import { SettingsListRow } from '../components/SettingsListRow.js';
import { useAuth } from '../context/AuthContext.js';

type Tab = 'users' | 'invites';

interface AdminUser extends PublicUser {
  createdAt?: string;
}

export function AdminPanelScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'creator' | 'follower'>('follower');
  const [generatedLink, setGeneratedLink] = useState('');

  if (!user || user.appRole !== 'admin') {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <p role="alert" className="font-ui text-body text-caption">
          {t('admin.accessDenied')}
        </p>
        <button
          onClick={() => navigate('/trips')}
          className="ml-4 font-ui text-sm text-accent underline"
        >
          {t('nav.trips')}
        </button>
      </div>
    );
  }

  return (
    <AdminPanelContent
      token={accessToken!}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      inviteEmail={inviteEmail}
      setInviteEmail={setInviteEmail}
      inviteRole={inviteRole}
      setInviteRole={setInviteRole}
      generatedLink={generatedLink}
      setGeneratedLink={setGeneratedLink}
      queryClient={queryClient}
    />
  );
}

function AdminPanelContent({
  token,
  activeTab,
  setActiveTab,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  generatedLink,
  setGeneratedLink,
  queryClient,
}: {
  token: string;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteRole: 'creator' | 'follower';
  setInviteRole: (v: 'creator' | 'follower') => void;
  generatedLink: string;
  setGeneratedLink: (v: string) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { t } = useTranslation();

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => apiJson<AdminUser[]>('/api/v1/users', { token }),
    enabled: !!token && activeTab === 'users',
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ['admin-invites'],
    queryFn: () => apiJson<Invite[]>('/api/v1/invites/platform?status=pending', { token }),
    enabled: !!token && activeTab === 'invites',
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

  const promoteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiJson<AdminUser>(`/api/v1/users/${userId}/promote`, { method: 'PATCH', token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return (
    <div className="min-h-screen bg-bg-primary pb-24">
      <header className="px-4 pt-8 pb-4">
        <h1 className="font-display text-2xl text-heading">{t('admin.title')}</h1>
      </header>

      {/* Tab bar */}
      <div className="px-4 flex gap-2 mb-6">
        {(['users', 'invites'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-ui text-sm font-semibold rounded-round-eight transition-all ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'border border-caption text-caption hover:border-accent hover:text-accent'
            }`}
          >
            {t(`admin.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <main className="px-4">
        {activeTab === 'users' && (
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
        )}

        {activeTab === 'invites' && (
          <section className="space-y-6">
            {/* Create invite form */}
            <div className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createInviteMutation.mutate();
                }}
                className="space-y-3"
              >
                <div>
                  <label htmlFor="invite-email" className="block font-ui text-sm font-medium text-body mb-1">
                    {t('admin.invite.emailLabel')}
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
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

            {/* Pending invites */}
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
        )}
      </main>
    </div>
  );
}
