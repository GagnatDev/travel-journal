import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@travel-journal/shared';

import { apiJson, apiJsonIfOk } from '../api/client.js';
import { AuthPageLayout } from '../components/ui/AuthPageLayout.js';
import { TextField } from '../components/ui/TextField.js';
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
    <AuthPageLayout title={t('common.loading')} bodyClassName="w-full max-w-sm text-center">
      <p className="font-ui text-body">{t('common.loading')}</p>
    </AuthPageLayout>
    );
  }

  if (tokenError) {
    return (
    <AuthPageLayout
      title={t('invite.accept.title')}
      bodyClassName="max-w-md w-full text-center space-y-4"
      titleClassName="font-display text-2xl text-heading text-center mb-4"
    >
      <p role="alert" className="font-ui text-body text-caption">
        {t('invite.accept.expiredError')}
      </p>
    </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout
      title={t('invite.accept.title')}
      bodyClassName="max-w-md w-full space-y-6"
      titleClassName="font-display text-2xl text-heading text-center"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label={t('auth.login.emailLabel')}
          labelHtmlFor="invite-email-readonly"
          type="email"
          value={email}
          readOnly
          aria-label={t('auth.login.emailLabel')}
          className="opacity-60 cursor-not-allowed"
        />

        <TextField
          label={t('invite.accept.displayNameLabel')}
          labelHtmlFor="invite-displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('auth.register.displayNamePlaceholder')}
          required
        />

        <TextField
          label={t('invite.accept.passwordLabel')}
          labelHtmlFor="invite-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          error={passwordError}
          errorId="invite-password-error"
          errorClassName="mt-1 font-ui text-sm text-red-500"
        />

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
    </AuthPageLayout>
  );
}
