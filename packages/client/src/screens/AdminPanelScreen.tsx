import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';

import { AdminInvitesTab } from './adminPanel/AdminInvitesTab.js';
import { AdminUsersTab } from './adminPanel/AdminUsersTab.js';
import type { AdminPanelTab } from './adminPanel/types.js';

export function AdminPanelScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminPanelTab>('users');

  if (!user || user.appRole !== 'admin') {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <p role="alert" className="font-ui text-body text-caption">
          {t('admin.accessDenied')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/trips')}
          className="ml-4 font-ui text-sm text-accent underline"
        >
          {t('nav.trips')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary pb-24">
      <header className="px-4 pt-8 pb-4">
        <h1 className="font-display text-2xl text-heading">{t('admin.title')}</h1>
      </header>

      <div className="px-4 flex gap-2 mb-6">
        {(['users', 'invites'] as AdminPanelTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
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
        {activeTab === 'users' && <AdminUsersTab token={accessToken!} />}
        {activeTab === 'invites' && <AdminInvitesTab token={accessToken!} />}
      </main>
    </div>
  );
}
