import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminExistsResponse } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';

export function AdminRegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    displayName?: string;
    password?: string;
    api?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamically get login from context — we can't call hooks conditionally
  const { login } = useAuth();

  useEffect(() => {
    fetch('/api/v1/auth/register')
      .then((res) => res.json() as Promise<AdminExistsResponse>)
      .then((data) => {
        if (data.adminExists) {
          navigate('/login', { replace: true });
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        navigate('/login', { replace: true });
      });
  }, [navigate]);

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = t('auth.errors.emailRequired');
    if (!displayName) newErrors.displayName = t('auth.errors.displayNameRequired');
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
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, displayName, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: { message: string } };
        throw new Error(data.error?.message ?? t('common.error'));
      }

      // Auto-login: the register endpoint already set the cookie, just refresh
      await login(email, password);
      navigate('/trips');
    } catch (err) {
      setErrors({ api: err instanceof Error ? err.message : t('common.error') });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <p className="font-ui text-body">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-heading mb-8 text-center">
          {t('auth.register.title')}
        </h1>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block font-ui text-sm font-medium text-body mb-1">
              {t('auth.register.emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {errors.email && (
              <p role="alert" className="mt-1 text-xs text-accent font-ui">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="block font-ui text-sm font-medium text-body mb-1"
            >
              {t('auth.register.displayNameLabel')}
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('auth.register.displayNamePlaceholder')}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {errors.displayName && (
              <p role="alert" className="mt-1 text-xs text-accent font-ui">
                {errors.displayName}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-ui text-sm font-medium text-body mb-1"
            >
              {t('auth.register.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {errors.password && (
              <p role="alert" className="mt-1 text-xs text-accent font-ui">
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
            {isSubmitting ? t('common.loading') : t('auth.register.submitButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
