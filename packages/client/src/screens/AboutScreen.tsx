import { useTranslation } from 'react-i18next';

import { useCopyFeedback } from '../hooks/useCopyFeedback.js';
import { APP_VERSION, BUILD_TIME } from '../lib/appVersion.js';

export function AboutScreen() {
  const { t, i18n } = useTranslation();
  const { copied, copyFailed, copyToClipboard } = useCopyFeedback();

  const buildDate = new Date(BUILD_TIME);
  const buildTimeLabel = Number.isNaN(buildDate.getTime())
    ? BUILD_TIME
    : new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(buildDate);

  const copyLabel = copied
    ? t('common.copied')
    : copyFailed
      ? t('common.copyFailed')
      : t('about.copyVersion');

  return (
    <main className="pt-14 min-h-screen bg-bg-primary">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <h1 className="font-display text-xl text-heading">{t('about.title')}</h1>

        <p className="font-ui text-sm text-body">{t('about.description')}</p>

        <section className="space-y-2">
          <p className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
            {t('about.version')}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-heading break-all" data-testid="app-version">
              {APP_VERSION}
            </span>
            <button
              type="button"
              onClick={() => void copyToClipboard(APP_VERSION)}
              className="shrink-0 font-ui text-sm text-accent hover:text-heading transition-colors"
            >
              {copyLabel}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <p className="font-ui text-xs font-semibold text-caption uppercase tracking-wide">
            {t('about.buildTime')}
          </p>
          <p className="font-ui text-sm text-body">{buildTimeLabel}</p>
        </section>
      </div>
    </main>
  );
}
