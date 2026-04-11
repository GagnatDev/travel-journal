import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

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

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block font-ui text-sm font-medium text-body mb-1">
              {t('auth.login.emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.login.emailPlaceholder')}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {errors.email && (
              <p id="email-error" role="alert" className="mt-1 text-xs text-accent font-ui">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block font-ui text-sm font-medium text-body mb-1">
              {t('auth.login.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.login.passwordPlaceholder')}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {errors.password && (
              <p id="password-error" role="alert" className="mt-1 text-xs text-accent font-ui">
                {errors.password}
              </p>
            )}
          </div>

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
