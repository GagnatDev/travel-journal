import { useTranslation } from 'react-i18next';

import { apiJson } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const { accessToken } = useAuth();

  const currentLang = i18n.language.startsWith('en') ? 'en' : 'nb';
  const nextLang = currentLang === 'nb' ? 'en' : 'nb';

  const handleSwitch = async () => {
    await i18n.changeLanguage(nextLang);
    localStorage.setItem('preferredLocale', nextLang);

    if (accessToken) {
      // Persist preference server-side when logged in (wired fully in Phase 4)
      void apiJson('/api/v1/users/me', {
        method: 'PATCH',
        token: accessToken,
        body: { preferredLocale: nextLang },
      }).catch(() => {
        // best effort
      });
    }
  };

  return (
    <button
      onClick={handleSwitch}
      className="font-ui text-sm text-caption hover:text-body transition-colors"
      aria-label={`Switch to ${t(`language.${nextLang}`)}`}
    >
      {t(`language.${nextLang}`)}
    </button>
  );
}
