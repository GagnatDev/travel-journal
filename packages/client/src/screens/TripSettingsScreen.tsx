import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Trip, TripStatus } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';

async function fetchTrip(tripId: string, accessToken: string): Promise<Trip> {
  const res = await fetch(`/api/v1/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Not found');
  return res.json() as Promise<Trip>;
}

export function TripSettingsScreen() {
  const { t } = useTranslation();
  const { id: tripId } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [hasLoadedName, setHasLoadedName] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId!, accessToken!),
    enabled: !!tripId && !!accessToken,
  });

  // Set name once on first load
  if (trip && !hasLoadedName) {
    setName(trip.name);
    setHasLoadedName(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string }) => {
      const res = await fetch(`/api/v1/trips/${tripId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Update failed');
      return res.json() as Promise<Trip>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: TripStatus) => {
      const res = await fetch(`/api/v1/trips/${tripId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Status update failed');
      return res.json() as Promise<Trip>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/trips/${tripId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      navigate('/trips');
    },
  });

  const myMember = trip?.members.find((m) => m.userId === user?.id);
  const isCreator = !!myMember && myMember.tripRole === 'creator';

  useEffect(() => {
    if (trip && !isCreator) {
      navigate(`/trips/${tripId}/timeline`);
    }
  }, [trip, isCreator, navigate, tripId]);

  if (isLoading || !trip) {
    return null;
  }

  if (!isCreator) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bg-primary pb-24">
      <header className="px-4 pt-8 pb-4">
        <button onClick={() => navigate(-1)} className="font-ui text-sm text-caption mb-2">
          ← Back
        </button>
        <h1 className="font-display text-2xl text-heading">{t('trips.settings.title')}</h1>
      </header>

      <main className="px-4 space-y-8">
        {/* Trip Details */}
        <section>
          <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
            {t('trips.settings.detailsTitle')}
          </h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="settings-name" className="block font-ui text-sm font-medium text-body mb-1">
                {t('trips.create.nameLabel')}
              </label>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button
              onClick={() => updateMutation.mutate({ name })}
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </section>

        {/* Status Management */}
        <section>
          <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide mb-3">
            {t('trips.settings.statusTitle')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {trip.status === 'planned' && (
              <button
                onClick={() => statusMutation.mutate('active')}
                disabled={statusMutation.isPending}
                className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
              >
                {t('trips.settings.markActive')}
              </button>
            )}
            {trip.status === 'active' && (
              <button
                onClick={() => statusMutation.mutate('completed')}
                disabled={statusMutation.isPending}
                className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
              >
                {t('trips.settings.markCompleted')}
              </button>
            )}
            {trip.status === 'completed' && (
              <button
                onClick={() => statusMutation.mutate('active')}
                disabled={statusMutation.isPending}
                className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
              >
                {t('trips.settings.reopen')}
              </button>
            )}
          </div>
        </section>

        {/* Delete */}
        <section>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 border border-accent text-accent font-ui text-sm font-semibold rounded-round-eight hover:bg-accent hover:text-white active:scale-95 transition-all"
            >
              {t('trips.settings.deleteButton')}
            </button>
          ) : (
            <div className="p-4 bg-bg-secondary rounded-round-eight space-y-3">
              <p className="font-ui text-sm text-body">{t('trips.settings.deleteConfirmMessage')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 border border-caption rounded-round-eight font-ui text-sm text-body"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2 bg-accent text-white font-ui text-sm font-semibold rounded-round-eight active:scale-95 transition-all"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
