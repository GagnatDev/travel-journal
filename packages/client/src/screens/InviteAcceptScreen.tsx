import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@travel-journal/shared';

import { apiJson, apiJsonIfOk } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

interface ValidateResponse {
  email: string;
  type: string;
  assignedAppRole: string;
}

export function InviteAcceptScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();

  const token = searchParams.get('token') ?? '';

  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [email, setEmail] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!token) {
      setTokenError(true);
      setValidating(false);
      return;
    }

    apiJsonIfOk<ValidateResponse>(`/api/v1/invites/${encodeURIComponent(token)}/validate`)
      .then((data) => {
        if (!data) {
          setTokenError(true);
        } else {
          setEmail(data.email);
        }
      })
      .catch(() => setTokenError(true))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setSubmitError('');

    if (password.length < 8) {
      setPasswordError(t('invite.accept.passwordMinLength'));
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiJson<{ accessToken: string; user: PublicUser }>('/api/v1/invites/accept', {
        method: 'POST',
        credentials: 'include',
        body: { token, displayName, password },
      });
      loginWithToken(data.accessToken, data.user);
      navigate('/trips');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <p className="font-ui text-body">{t('common.loading')}</p>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <p role="alert" className="font-ui text-body text-caption">
            {t('invite.accept.expiredError')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        <h1 className="font-display text-2xl text-heading text-center">
          {t('invite.accept.title')}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-ui text-sm font-medium text-body mb-1">
              {t('auth.login.emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              readOnly
              aria-label={t('auth.login.emailLabel')}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary opacity-60 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="invite-displayName" className="block font-ui text-sm font-medium text-body mb-1">
              {t('invite.accept.displayNameLabel')}
            </label>
            <input
              id="invite-displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('auth.register.displayNamePlaceholder')}
              required
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="invite-password" className="block font-ui text-sm font-medium text-body mb-1">
              {t('invite.accept.passwordLabel')}
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {passwordError && (
              <p role="alert" className="mt-1 font-ui text-sm text-red-500">
                {passwordError}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="font-ui text-sm text-red-500">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-accent text-white font-ui font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {t('invite.accept.submitButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
