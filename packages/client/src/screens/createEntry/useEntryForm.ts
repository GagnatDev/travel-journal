import { useCallback } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { EntryImage } from '@travel-journal/shared';

import { entryFormIsDirty, type EntryFormState } from './entryFormState.js';

/**
 * Form-only handlers for create/edit entry: location toggle, discard with dirty
 * check, and title/content validation for submit.
 */
export function useEntryForm(
  form: EntryFormState,
  setForm: React.Dispatch<React.SetStateAction<EntryFormState>>,
  initialForm: EntryFormState,
  images: EntryImage[],
  initialImages: EntryImage[],
  localFiles: File[],
  initialLocalFiles: File[],
  setTitleError: React.Dispatch<React.SetStateAction<string>>,
  setContentError: React.Dispatch<React.SetStateAction<string>>,
  t: TFunction,
  navigate: NavigateFunction,
  tripId: string | undefined,
) {
  const handleLocationToggle = useCallback(() => {
    if (!form.locationEnabled) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setForm((prev) => ({
            ...prev,
            locationEnabled: true,
            locationLat: pos.coords.latitude,
            locationLng: pos.coords.longitude,
          }));
        },
        () => {
          setForm((prev) => ({ ...prev, locationEnabled: true }));
        },
      );
    } else {
      setForm((prev) => ({
        ...prev,
        locationEnabled: false,
        locationLat: null,
        locationLng: null,
        locationName: '',
      }));
    }
  }, [form.locationEnabled, setForm]);

  const handleDiscard = useCallback(() => {
    if (
      entryFormIsDirty(form, initialForm, images, initialImages, localFiles, initialLocalFiles)
    ) {
      if (!window.confirm(t('entries.discardConfirm'))) return;
    }
    navigate(`/trips/${tripId}/timeline`);
  }, [
    form,
    initialForm,
    images,
    initialImages,
    localFiles,
    initialLocalFiles,
    navigate,
    t,
    tripId,
  ]);

  const validateRequiredFields = useCallback((): boolean => {
    let valid = true;

    if (!form.title.trim()) {
      setTitleError(t('entries.titleRequired'));
      valid = false;
    } else {
      setTitleError('');
    }

    if (!form.content.trim()) {
      setContentError(t('entries.contentRequired'));
      valid = false;
    } else {
      setContentError('');
    }

    return valid;
  }, [form.title, form.content, setTitleError, setContentError, t]);

  return { handleLocationToggle, handleDiscard, validateRequiredFields };
}
