import { useTranslation } from 'react-i18next';

interface DayHeaderProps {
  date: Date;
  dayNumber: number | null;
  locationSummary?: string;
}

export function DayHeader({ date, dayNumber, locationSummary }: DayHeaderProps) {
  const { t, i18n } = useTranslation();

  const formattedDate = date.toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
  });

  const label =
    dayNumber != null
      ? `${t('storyMode.day')} ${dayNumber} — ${formattedDate}`
      : formattedDate;

  return (
    <div className="pt-4 pb-2 border-b border-caption/20" data-testid="day-header">
      <h2 className="font-display text-lg text-heading">{label}</h2>
      {locationSummary && (
        <p className="font-ui text-xs text-caption mt-0.5">{locationSummary}</p>
      )}
    </div>
  );
}
