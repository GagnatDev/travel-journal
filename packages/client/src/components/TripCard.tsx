import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Trip, TripRole } from '@travel-journal/shared';

interface TripCardProps {
  trip: Trip;
  currentUserId: string;
  /** Brief emphasis when user lands from a “you were added” notification. */
  isHighlighted?: boolean;
}

const STATUS_COLORS: Record<Trip['status'], string> = {
  planned: 'bg-bg-secondary text-body',
  active: 'bg-accent text-white',
  completed: 'bg-caption text-white',
};

export function TripCard({ trip, currentUserId, isHighlighted }: TripCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const myMember = trip.members.find((m) => m.userId === currentUserId);
  const myRole: TripRole | undefined = myMember?.tripRole;

  function formatDate(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const departure = formatDate(trip.departureDate);
  const returnDate = formatDate(trip.returnDate);
  const dateRange = [departure, returnDate].filter(Boolean).join(' – ');

  return (
    <button
      onClick={() => navigate(`/trips/${trip.id}/timeline`)}
      className={`w-full text-left p-4 bg-bg-secondary rounded-round-eight border transition-all active:scale-95 ${
        isHighlighted
          ? 'border-accent ring-2 ring-accent/40 ring-offset-2 ring-offset-bg-primary'
          : 'border-caption/20 hover:border-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-lg text-heading">{trip.name}</span>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full font-ui text-xs font-semibold ${STATUS_COLORS[trip.status]}`}
        >
          {t(`trips.status.${trip.status}`)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 font-ui text-sm text-caption">
        {myRole && <span>{t(`trips.role.${myRole}`)}</span>}
        {dateRange && <span>·</span>}
        {dateRange && <span>{dateRange}</span>}
      </div>
    </button>
  );
}
