import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AuthPageLayout } from '../components/ui/AuthPageLayout.js';
import { TextField } from '../components/ui/TextField.js';
import { useAuth } from '../context/AuthContext.js';

const fieldErrorClass = 'mt-1 text-xs text-accent font-ui';

type LoginLocationState = {
  sessionExpired?: boolean;
  passwordResetComplete?: boolean;
  email?: string;
} | null;

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as LoginLocationState;
  const sessionExpired = locState?.sessionExpired === true;
  const passwordResetComplete = locState?.passwordResetComplete === true;

  const [email, setEmail] = useState(locState?.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; api?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const s = location.state as LoginLocationState;
    if (s?.email) setEmail(s.email);
  }, [location.state]);

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = t('auth.errors.emailRequired');
    if (!password) newErrors.password = t('auth.errors.passwordRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      await login(email, password);
      navigate('/trips');
    } catch (err) {
      setErrors({ api: err instanceof Error ? err.message : t('common.error') });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageLayout title={t('auth.login.title')}>
      {sessionExpired && (
        <p role="alert" className="mb-4 text-sm text-center font-ui text-accent">
          {t('auth.login.sessionExpired')}
        </p>
      )}
      {passwordResetComplete && (
        <p role="status" className="mb-4 text-sm text-center font-ui text-body">
          {t('auth.login.passwordResetComplete')}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          label={t('auth.login.emailLabel')}
          labelHtmlFor="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('auth.login.emailPlaceholder')}
          error={errors.email}
          errorId="email-error"
          errorClassName={fieldErrorClass}
        />

        <TextField
          label={t('auth.login.passwordLabel')}
          labelHtmlFor="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('auth.login.passwordPlaceholder')}
          error={errors.password}
          errorId="password-error"
          errorClassName={fieldErrorClass}
        />

        {errors.api && (
          <p role="alert" className="text-sm text-accent font-ui">
            {errors.api}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-accent text-white font-ui font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {isSubmitting ? t('common.loading') : t('auth.login.submitButton')}
        </button>
      </form>
    </AuthPageLayout>
  );
}
