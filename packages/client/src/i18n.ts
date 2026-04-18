import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import nbTranslation from './locales/nb/translation.json';

/**
 * Default `translation` resources for `nb` and `en` are bundled so the first
 * paint never waits on a `/locales/...` round trip. If we split namespaces and
 * lazy-load some via HTTP later, add `i18next-http-backend` again and merge
 * `resources` with `partialBundledLanguages: true` (see i18next docs).
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'nb',
    supportedLngs: ['nb', 'en'],
    resources: {
      nb: { translation: nbTranslation },
      en: { translation: enTranslation },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'preferredLocale',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
