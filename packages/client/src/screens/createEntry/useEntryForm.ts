import { useCallback } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { EntryImage } from '@travel-journal/shared';

import {
  entryFormIsDirty,
  type EntryFormState,
  type EntryLocationSource,
} from './entryFormState.js';

/**
 * Form-only handlers for create/edit entry: location source, discard with dirty
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
  const handleLocationSourceChange = useCallback(
    (next: EntryLocationSource) => {
      if (next === 'off') {
        setForm((prev) => ({
          ...prev,
          locationSource: 'off',
          locationLat: null,
          locationLng: null,
          locationName: '',
        }));
        return;
      }

      if (next === 'exif') {
        setForm((prev) => ({
          ...prev,
          locationSource: 'exif',
          locationLat: null,
          locationLng: null,
        }));
        return;
      }

      setForm((prev) => ({
        ...prev,
        locationSource: 'device',
        locationLat: null,
        locationLng: null,
      }));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setForm((prev) => ({
            ...prev,
            locationSource: 'device',
            locationLat: pos.coords.latitude,
            locationLng: pos.coords.longitude,
          }));
        },
        () => {
          setForm((prev) => ({
            ...prev,
            locationSource: 'device',
            locationLat: null,
            locationLng: null,
          }));
        },
      );
    },
    [setForm],
  );

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

  return { handleLocationSourceChange, handleDiscard, validateRequiredFields };
}
