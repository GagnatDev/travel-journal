import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Trip, CreateTripRequest } from '@travel-journal/shared';

import { apiJson } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

import { TextArea } from './ui/TextArea.js';
import { TextField } from './ui/TextField.js';

const fieldErrorClass = 'mt-1 text-xs text-accent font-ui';

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

      const trip = await apiJson<Trip>('/api/v1/trips', {
        method: 'POST',
        token: accessToken!,
        body,
      });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      onClose();
      navigate(`/trips/${trip.id}/timeline`);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-heading/55 backdrop-blur-md supports-[backdrop-filter]:bg-heading/40"
      role="presentation"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-md bg-bg-primary rounded-t-2xl sm:rounded-2xl p-6 shadow-xl border border-caption/20"
        role="dialog"
        aria-modal="true"
        aria-label={t('trips.create.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl text-heading mb-4">{t('trips.create.title')}</h2>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            label={t('trips.create.nameLabel')}
            labelHtmlFor="trip-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('trips.create.namePlaceholder')}
            error={nameError}
            errorId="trip-name-error"
            errorClassName={fieldErrorClass}
          />

          <TextArea
            label={t('trips.create.descriptionLabel')}
            labelHtmlFor="trip-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('trips.create.descriptionPlaceholder')}
            rows={2}
            className="resize-none"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label={t('trips.create.departureDateLabel')}
              labelHtmlFor="departure-date"
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
            <TextField
              label={t('trips.create.returnDateLabel')}
              labelHtmlFor="return-date"
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
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
