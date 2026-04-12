import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiJson } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import type { PublicUser } from '@travel-journal/shared';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function ProfileScreen() {
  const { t } = useTranslation();
  const { user, accessToken, logout, setUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleEdit = () => {
    setDraftName(user.displayName);
    setError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiJson<PublicUser>('/api/v1/users/me', {
        method: 'PATCH',
        ...(accessToken != null ? { token: accessToken } : {}),
        body: { displayName: trimmed },
      });
      setUser(updated);
      setEditing(false);
    } catch {
      setError(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="pt-14 min-h-screen bg-bg-primary">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-full bg-accent flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="font-display text-2xl text-white">{initials(user.displayName)}</span>
          </div>
          <h1 className="font-display text-xl text-heading">{t('profile.title')}</h1>
        </div>

        {/* Display name */}
        <section className="space-y-2">
          <p className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
            {t('profile.displayNameLabel')}
          </p>

          {editing ? (
            <div className="space-y-2">
              <input
                id="profile-display-name"
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                aria-label={t('profile.displayNameLabel')}
                className="w-full rounded-lg border border-caption/30 bg-bg-secondary px-3 py-2 font-ui text-sm text-heading focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {error && (
                <p role="alert" className="text-xs text-red-500 font-ui">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !draftName.trim()}
                  className="font-ui text-sm px-4 py-1.5 rounded-lg bg-accent text-white disabled:opacity-50"
                >
                  {t('profile.saveButton')}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="font-ui text-sm px-4 py-1.5 rounded-lg border border-caption/30 text-body"
                >
                  {t('profile.cancelButton')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-ui text-sm text-heading">{user.displayName}</span>
              <button
                type="button"
                onClick={handleEdit}
                className="font-ui text-sm text-accent hover:text-heading transition-colors"
              >
                {t('profile.editButton')}
              </button>
            </div>
          )}
        </section>

        {/* Email */}
        <section className="space-y-2">
          <p className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
            {t('profile.emailLabel')}
          </p>
          <p className="font-ui text-sm text-body">{user.email}</p>
        </section>

        <hr className="border-caption/10" />

        {/* Log out */}
        <button
          type="button"
          onClick={logout}
          className="w-full font-ui text-sm text-red-500 hover:text-red-400 transition-colors py-2 text-left"
        >
          {t('profile.logoutButton')}
        </button>
      </div>
    </main>
  );
}
