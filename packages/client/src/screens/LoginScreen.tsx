import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { TextField } from '../components/ui/TextField.js';
import { useAuth } from '../context/AuthContext.js';

const fieldErrorClass = 'mt-1 text-xs text-accent font-ui';

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionExpired = (location.state as { sessionExpired?: boolean } | null)?.sessionExpired === true;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; api?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-heading mb-8 text-center">
          {t('auth.login.title')}
        </h1>

        {sessionExpired && (
          <p role="alert" className="mb-4 text-sm text-center font-ui text-accent">
            {t('auth.login.sessionExpired')}
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
      </div>
    </div>
  );
}
