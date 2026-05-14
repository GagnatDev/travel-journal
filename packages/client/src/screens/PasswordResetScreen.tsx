import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { apiJson, apiJsonIfOk } from '../api/client.js';
import { AuthPageLayout } from '../components/ui/AuthPageLayout.js';
import { TextField } from '../components/ui/TextField.js';

interface ValidateResponse {
  email: string;
}

export function PasswordResetScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token') ?? '';

  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!token) {
      setTokenError(true);
      setValidating(false);
      return;
    }

    apiJsonIfOk<ValidateResponse>(
      `/api/v1/auth/password-reset/${encodeURIComponent(token)}/validate`,
      { credentials: 'omit' },
    )
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
    setConfirmError('');
    setSubmitError('');

    if (password.length < 8) {
      setPasswordError(t('passwordReset.passwordMinLength'));
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError(t('passwordReset.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await apiJson<void>('/api/v1/auth/password-reset/complete', {
        method: 'POST',
        body: { token, password },
        credentials: 'omit',
      });
      navigate('/login', { state: { passwordResetComplete: true, email } });
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
        title={t('passwordReset.title')}
        bodyClassName="max-w-md w-full text-center space-y-4"
        titleClassName="font-display text-2xl text-heading text-center mb-4"
      >
        <p role="alert" className="font-ui text-body text-caption">
          {t('passwordReset.expiredError')}
        </p>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout
      title={t('passwordReset.title')}
      bodyClassName="max-w-md w-full space-y-6"
      titleClassName="font-display text-2xl text-heading text-center"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label={t('auth.login.emailLabel')}
          labelHtmlFor="reset-email-readonly"
          type="email"
          value={email}
          readOnly
          aria-label={t('auth.login.emailLabel')}
          className="opacity-60 cursor-not-allowed"
        />

        <TextField
          label={t('passwordReset.passwordLabel')}
          labelHtmlFor="reset-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          error={passwordError}
          errorId="reset-password-error"
          errorClassName="mt-1 font-ui text-sm text-red-500"
        />

        <TextField
          label={t('passwordReset.confirmPasswordLabel')}
          labelHtmlFor="reset-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          error={confirmError}
          errorId="reset-confirm-password-error"
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
          {t('passwordReset.submitButton')}
        </button>
      </form>
    </AuthPageLayout>
  );
}
