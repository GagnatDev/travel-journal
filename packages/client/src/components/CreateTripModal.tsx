import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Trip, CreateTripRequest } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';

interface CreateTripModalProps {
  onClose: () => void;
}

export function CreateTripModal({ onClose }: CreateTripModalProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setNameError(t('trips.create.nameRequired'));
      return;
    }

    setNameError('');
    setIsSubmitting(true);

    try {
      const body: CreateTripRequest = {
        name: name.trim(),
        ...(description && { description }),
        ...(departureDate && { departureDate }),
        ...(returnDate && { returnDate }),
      };

      const res = await fetch('/api/v1/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: { message: string } };
        throw new Error(data.error?.message ?? t('common.error'));
      }

      const trip = (await res.json()) as Trip;
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      onClose();
      navigate(`/trips/${trip.id}/timeline`);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-heading/40">
      <div
        className="w-full sm:max-w-md bg-bg-primary rounded-t-2xl sm:rounded-2xl p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('trips.create.title')}
      >
        <h2 className="font-display text-xl text-heading mb-4">{t('trips.create.title')}</h2>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="trip-name" className="block font-ui text-sm font-medium text-body mb-1">
              {t('trips.create.nameLabel')}
            </label>
            <input
              id="trip-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('trips.create.namePlaceholder')}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {nameError && (
              <p role="alert" className="mt-1 text-xs text-accent font-ui">
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="trip-description" className="block font-ui text-sm font-medium text-body mb-1">
              {t('trips.create.descriptionLabel')}
            </label>
            <textarea
              id="trip-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('trips.create.descriptionPlaceholder')}
              rows={2}
              className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="departure-date" className="block font-ui text-sm font-medium text-body mb-1">
                {t('trips.create.departureDateLabel')}
              </label>
              <input
                id="departure-date"
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="return-date" className="block font-ui text-sm font-medium text-body mb-1">
                {t('trips.create.returnDateLabel')}
              </label>
              <input
                id="return-date"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-caption rounded-round-eight font-ui font-semibold text-body hover:bg-bg-secondary active:scale-95 transition-all"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-accent text-white font-ui font-semibold rounded-round-eight hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? t('common.loading') : t('trips.create.submitButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
