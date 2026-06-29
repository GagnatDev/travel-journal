import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser, ShippingAddress } from '@travel-journal/shared';

import { apiJson } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { TextField } from '../components/ui/TextField.js';
import { useUsageHintsSettings } from '../hooks/useUsageHintsSettings.js';
import { compressImage } from '../utils/compressImage.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';
import { UserProfileModal } from '../components/UserProfileModal.js';

type AddressDraft = {
  recipientName: string;
  email: string;
  phoneNumber: string;
  line1: string;
  line2: string;
  townOrCity: string;
  stateOrCounty: string;
  postalOrZipCode: string;
  countryCode: string;
};

function addressDraftFrom(address: ShippingAddress | undefined): AddressDraft {
  return {
    recipientName: address?.recipientName ?? '',
    email: address?.email ?? '',
    phoneNumber: address?.phoneNumber ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    townOrCity: address?.townOrCity ?? '',
    stateOrCounty: address?.stateOrCounty ?? '',
    postalOrZipCode: address?.postalOrZipCode ?? '',
    countryCode: address?.countryCode ?? '',
  };
}

function draftToShippingAddress(draft: AddressDraft): ShippingAddress {
  const address: ShippingAddress = {
    recipientName: draft.recipientName.trim(),
    line1: draft.line1.trim(),
    townOrCity: draft.townOrCity.trim(),
    postalOrZipCode: draft.postalOrZipCode.trim(),
    countryCode: draft.countryCode.trim(),
  };
  const email = draft.email.trim();
  const phoneNumber = draft.phoneNumber.trim();
  const line2 = draft.line2.trim();
  const stateOrCounty = draft.stateOrCounty.trim();
  if (email.length > 0) address.email = email;
  if (phoneNumber.length > 0) address.phoneNumber = phoneNumber;
  if (line2.length > 0) address.line2 = line2;
  if (stateOrCounty.length > 0) address.stateOrCounty = stateOrCounty;
  return address;
}

function addressDraftComplete(draft: AddressDraft): boolean {
  return (
    draft.recipientName.trim().length > 0 &&
    draft.line1.trim().length > 0 &&
    draft.townOrCity.trim().length > 0 &&
    draft.postalOrZipCode.trim().length > 0 &&
    draft.countryCode.trim().length > 0
  );
}

function addressSummary(address: ShippingAddress): string {
  return [address.recipientName, address.line1, address.townOrCity, `${address.postalOrZipCode} ${address.countryCode}`.trim()]
    .filter((part) => part.length > 0)
    .join(', ');
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function ProfileScreen() {
  const { t } = useTranslation();
  const { user, accessToken, logout, setUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enabled: hintsEnabled, dismissedCount, setEnabled, resetDismissed } =
    useUsageHintsSettings();

  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(() =>
    addressDraftFrom(user?.shippingAddress),
  );
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing && user != null) {
      setDraftName(user.displayName);
    }
  }, [editing, user]);

  useEffect(() => {
    if (!editingAddress && user != null) {
      setAddressDraft(addressDraftFrom(user.shippingAddress));
    }
  }, [editingAddress, user]);

  // Load avatar blob URL
  useEffect(() => {
    const avatarKey = user?.avatarKey;
    if (!avatarKey || !accessToken) {
      setAvatarBlobUrl(null);
      return;
    }

    let cacheKey: string | null = null;
    let cancelled = false;

    acquireAuthenticatedMediaObjectUrl(avatarKey, accessToken)
      .then(({ cacheKey: ck, objectUrl }) => {
        if (cancelled) return;
        cacheKey = ck;
        setAvatarBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setAvatarBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (cacheKey) releaseAuthenticatedMediaObjectUrl(cacheKey);
      setAvatarBlobUrl(null);
    };
  }, [user?.avatarKey, accessToken]);

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

  const handleEditAddress = () => {
    setAddressDraft(addressDraftFrom(user.shippingAddress));
    setAddressError(null);
    setEditingAddress(true);
  };

  const handleCancelAddress = () => {
    setEditingAddress(false);
    setAddressError(null);
  };

  const handleSaveAddress = async () => {
    if (!addressDraftComplete(addressDraft)) return;
    setSavingAddress(true);
    setAddressError(null);
    try {
      const updated = await apiJson<PublicUser>('/api/v1/users/me', {
        method: 'PATCH',
        ...(accessToken != null ? { token: accessToken } : {}),
        body: { shippingAddress: draftToShippingAddress(addressDraft) },
      });
      setUser(updated);
      setEditingAddress(false);
    } catch {
      setAddressError(t('common.error'));
    } finally {
      setSavingAddress(false);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const { blob } = await compressImage(file, 800, 0.85);
      const formData = new FormData();
      formData.append('file', blob, 'avatar.jpg');

      const res = await fetch('/api/v1/users/me/avatar', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const updated = (await res.json()) as PublicUser;
      setUser(updated);
    } catch {
      setAvatarError(t('profile.photoUploadError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user.avatarKey) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const updated = await apiJson<PublicUser>('/api/v1/users/me/avatar', {
        method: 'DELETE',
        ...(accessToken ? { token: accessToken } : {}),
      });
      setUser(updated);
    } catch {
      setAvatarError(t('profile.photoUploadError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <main className="pt-14 min-h-screen bg-bg-primary">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative group">
            {/* Avatar image or initials */}
            <button
              type="button"
              aria-label={t('profile.viewProfile')}
              onClick={() => setProfileModalOpen(true)}
              className="w-20 h-20 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {avatarBlobUrl ? (
                <img
                  src={avatarBlobUrl}
                  alt={user.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-accent flex items-center justify-center" aria-hidden>
                  <span className="font-display text-2xl text-white">
                    {user.displayName.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')}
                  </span>
                </div>
              )}
            </button>

            {/* Camera overlay */}
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              aria-label={user.avatarKey ? t('profile.changePhoto') : t('profile.uploadPhoto')}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center shadow-md hover:bg-accent/80 transition-colors disabled:opacity-50"
            >
              {uploadingAvatar ? (
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <CameraIcon />
              )}
            </button>
          </div>

          {avatarError && (
            <p role="alert" className="text-xs text-red-500 font-ui">{avatarError}</p>
          )}

          {user.avatarKey && !uploadingAvatar && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="font-ui text-xs text-caption hover:text-red-400 transition-colors"
            >
              {t('profile.removePhoto')}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFileChange}
          />

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

        {/* Shipping address */}
        <section className="space-y-2" data-testid="profile-shipping-address">
          <div className="flex items-center justify-between">
            <p className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
              {t('profile.shippingAddress.title')}
            </p>
            {!editingAddress ? (
              <button
                type="button"
                onClick={handleEditAddress}
                className="font-ui text-sm text-accent hover:text-heading transition-colors"
              >
                {t('profile.shippingAddress.editButton')}
              </button>
            ) : null}
          </div>

          {editingAddress ? (
            <div className="space-y-3">
              <TextField
                label={t('profile.shippingAddress.recipientName')}
                labelHtmlFor="address-recipient-name"
                value={addressDraft.recipientName}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, recipientName: e.target.value }))
                }
              />
              <TextField
                label={t('profile.shippingAddress.line1')}
                labelHtmlFor="address-line1"
                value={addressDraft.line1}
                onChange={(e) => setAddressDraft((d) => ({ ...d, line1: e.target.value }))}
              />
              <TextField
                label={t('profile.shippingAddress.line2')}
                labelHtmlFor="address-line2"
                value={addressDraft.line2}
                onChange={(e) => setAddressDraft((d) => ({ ...d, line2: e.target.value }))}
              />
              <TextField
                label={t('profile.shippingAddress.townOrCity')}
                labelHtmlFor="address-town"
                value={addressDraft.townOrCity}
                onChange={(e) => setAddressDraft((d) => ({ ...d, townOrCity: e.target.value }))}
              />
              <TextField
                label={t('profile.shippingAddress.stateOrCounty')}
                labelHtmlFor="address-state"
                value={addressDraft.stateOrCounty}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, stateOrCounty: e.target.value }))
                }
              />
              <TextField
                label={t('profile.shippingAddress.postalOrZipCode')}
                labelHtmlFor="address-postal"
                value={addressDraft.postalOrZipCode}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, postalOrZipCode: e.target.value }))
                }
              />
              <TextField
                label={t('profile.shippingAddress.countryCode')}
                labelHtmlFor="address-country"
                value={addressDraft.countryCode}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, countryCode: e.target.value }))
                }
              />
              <TextField
                label={t('profile.shippingAddress.email')}
                labelHtmlFor="address-email"
                type="email"
                value={addressDraft.email}
                onChange={(e) => setAddressDraft((d) => ({ ...d, email: e.target.value }))}
              />
              <TextField
                label={t('profile.shippingAddress.phoneNumber')}
                labelHtmlFor="address-phone"
                value={addressDraft.phoneNumber}
                onChange={(e) =>
                  setAddressDraft((d) => ({ ...d, phoneNumber: e.target.value }))
                }
              />
              {addressError ? (
                <p role="alert" className="text-xs text-red-500 font-ui">
                  {addressError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveAddress}
                  disabled={savingAddress || !addressDraftComplete(addressDraft)}
                  className="font-ui text-sm px-4 py-1.5 rounded-lg bg-accent text-white disabled:opacity-50"
                >
                  {t('profile.saveButton')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelAddress}
                  disabled={savingAddress}
                  className="font-ui text-sm px-4 py-1.5 rounded-lg border border-caption/30 text-body"
                >
                  {t('profile.cancelButton')}
                </button>
              </div>
            </div>
          ) : user.shippingAddress ? (
            <p className="font-ui text-sm text-body">{addressSummary(user.shippingAddress)}</p>
          ) : (
            <p className="font-ui text-sm text-caption">
              {t('profile.shippingAddress.emptyState')}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <p className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
            {t('hints.profile.sectionLabel')}
          </p>
          <label className="flex items-center justify-between gap-3">
            <span className="font-ui text-sm text-heading">{t('hints.profile.enabledLabel')}</span>
            <input
              type="checkbox"
              checked={hintsEnabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-caption/30 text-accent focus:ring-accent"
            />
          </label>
          {dismissedCount > 0 && (
            <button
              type="button"
              onClick={resetDismissed}
              className="font-ui text-sm text-accent hover:text-heading transition-colors"
            >
              {t('hints.profile.resetButton')}
            </button>
          )}
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

      {/* Full-screen profile modal */}
      <UserProfileModal
        userId={user.id}
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </main>
  );
}
