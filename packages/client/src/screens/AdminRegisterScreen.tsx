import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminExistsResponse } from '@travel-journal/shared';

import { apiJson, apiJsonIfOk } from '../api/client.js';
import { TextField } from '../components/ui/TextField.js';
import { useAuth } from '../context/AuthContext.js';

const fieldErrorClass = 'mt-1 text-xs text-accent font-ui';

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

  const { login } = useAuth();

  useEffect(() => {
    apiJsonIfOk<AdminExistsResponse>('/api/v1/auth/register')
      .then((data) => {
        if (!data) {
          navigate('/login', { replace: true });
          return;
        }
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
      await apiJson('/api/v1/auth/register', {
        method: 'POST',
        credentials: 'include',
        body: { email, displayName, password },
        fallbackErrorMessage: t('common.error'),
      });

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
          <TextField
            label={t('auth.register.emailLabel')}
            labelHtmlFor="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            errorId="register-email-error"
            errorClassName={fieldErrorClass}
          />

          <TextField
            label={t('auth.register.displayNameLabel')}
            labelHtmlFor="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('auth.register.displayNamePlaceholder')}
            error={errors.displayName}
            errorId="register-displayName-error"
            errorClassName={fieldErrorClass}
          />

          <TextField
            label={t('auth.register.passwordLabel')}
            labelHtmlFor="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            errorId="register-password-error"
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
            {isSubmitting ? t('common.loading') : t('auth.register.submitButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
