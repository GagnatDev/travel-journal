import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';
import { apiJson } from '../api/client.js';
import { Avatar } from './ui/Avatar.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';

interface UserProfileModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function formatDate(iso: string | undefined, language: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(language, { year: 'numeric', month: 'long' });
}

function roleLabel(role: string, t: (k: string) => string): string {
  const key = `trips.role.${role}`;
  return t(key) !== key ? t(key) : role;
}

export function UserProfileModal({ userId, isOpen, onClose }: UserProfileModalProps) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setUser(null);
    setAvatarUrl(null);

    apiJson<PublicUser>(`/api/v1/users/${userId}`, {
      ...(accessToken ? { token: accessToken } : {}),
    }).then((u) => {
      if (cancelled) return;
      setUser(u);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [userId, isOpen, accessToken]);

  useEffect(() => {
    if (!user?.avatarKey || !accessToken) return;
    let cacheKey: string | null = null;
    let cancelled = false;

    acquireAuthenticatedMediaObjectUrl(user.avatarKey, accessToken).then(({ cacheKey: ck, objectUrl }) => {
      if (cancelled) return;
      cacheKey = ck;
      setAvatarUrl(objectUrl);
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (cacheKey) releaseAuthenticatedMediaObjectUrl(cacheKey);
      setAvatarUrl(null);
    };
  }, [user?.avatarKey, accessToken]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.viewProfile')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-bg-primary rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          aria-label={t('profile.closeProfile')}
          onClick={onClose}
          className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
        >
          <XIcon />
        </button>

        {/* Avatar banner */}
        <div className="flex flex-col items-center pt-10 pb-6 px-6 bg-gradient-to-b from-accent/20 to-transparent gap-4">
          {avatarUrl ? (
            <button
              type="button"
              className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/20 focus:outline-none focus:ring-accent"
              onClick={() => window.open(avatarUrl, '_blank')}
              aria-label={user?.displayName ?? ''}
            >
              <img
                src={avatarUrl}
                alt={user?.displayName ?? ''}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <div className="w-28 h-28 ring-4 ring-white/20 rounded-full">
              <Avatar name={user?.displayName ?? '…'} size="md" />
            </div>
          )}

          {user ? (
            <div className="text-center">
              <p className="font-display text-xl text-heading">{user.displayName}</p>
              <p className="font-ui text-sm text-caption">{user.email}</p>
            </div>
          ) : (
            <div className="h-12 flex items-center justify-center">
              <div className="w-32 h-4 bg-caption/20 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Details */}
        {user && (
          <div className="px-6 pb-6 space-y-3">
            <div className="flex items-center justify-between py-2 border-t border-caption/10">
              <span className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
                {t('profile.role')}
              </span>
              <span className="font-ui text-sm text-heading">{roleLabel(user.appRole, t)}</span>
            </div>
            {user.createdAt && (
              <div className="flex items-center justify-between py-2 border-t border-caption/10">
                <span className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
                  {t('profile.memberSince')}
                </span>
                <span className="font-ui text-sm text-heading">
                  {formatDate(user.createdAt, i18n.language)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
