import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CreateEntryRequest, EntryImage, UpdateEntryRequest } from '@travel-journal/shared';

import { createEntry, fetchEntry, updateEntry } from '../api/entries.js';
import { uploadMedia } from '../api/media.js';
import { useAuth } from '../context/AuthContext.js';
import { ImageReorder } from '../components/ImageReorder.js';
import { compressImage } from '../utils/compressImage.js';
import { saveOfflineEntry } from '../offline/entrySync.js';

interface EntryFormState {
  title: string;
  content: string;
  locationEnabled: boolean;
  locationLat: number | null;
  locationLng: number | null;
  locationName: string;
}

const EMPTY_FORM: EntryFormState = {
  title: '',
  content: '',
  locationEnabled: false,
  locationLat: null,
  locationLng: null,
  locationName: '',
};

function formIsDirty(
  form: EntryFormState,
  initial: EntryFormState,
  images: EntryImage[],
  initialImages: EntryImage[],
  localFiles: File[],
): boolean {
  const imagesDirty =
    images.length !== initialImages.length ||
    images.some((img, i) => img.key !== initialImages[i]?.key) ||
    localFiles.length > 0;
  return (
    imagesDirty ||
    form.title !== initial.title ||
    form.content !== initial.content ||
    form.locationEnabled !== initial.locationEnabled ||
    form.locationLat !== initial.locationLat ||
    form.locationLng !== initial.locationLng ||
    form.locationName !== initial.locationName
  );
}

export function CreateEntryScreen() {
  const { id: tripId, entryId } = useParams<{ id: string; entryId?: string }>();
  const { accessToken } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!entryId;

  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<EntryFormState>(EMPTY_FORM);
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');
  const [images, setImages] = useState<EntryImage[]>([]);
  const [initialImages, setInitialImages] = useState<EntryImage[]>([]);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [savedOffline, setSavedOffline] = useState(false);

  // Object URLs for offline-queued files — cleaned up on unmount or file removal
  const localPreviews = useMemo(
    () => localFiles.map((f) => URL.createObjectURL(f)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localFiles],
  );

  useEffect(() => {
    return () => {
      localPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localPreviews]);

  // Load existing entry when editing
  const { data: existingEntry } = useQuery({
    queryKey: ['entry', tripId, entryId],
    queryFn: () => fetchEntry(tripId!, entryId!, accessToken!),
    enabled: isEdit && !!accessToken && !!tripId && !!entryId,
  });

  useEffect(() => {
    if (!existingEntry) return;
    const loaded: EntryFormState = {
      title: existingEntry.title,
      content: existingEntry.content,
      locationEnabled: !!existingEntry.location,
      locationLat: existingEntry.location?.lat ?? null,
      locationLng: existingEntry.location?.lng ?? null,
      locationName: existingEntry.location?.name ?? '',
    };
    setForm(loaded);
    setInitialForm(loaded);
    const loadedImages = existingEntry.images ?? [];
    setImages(loadedImages);
    setInitialImages(loadedImages);
    // Depend on id only so React Query refetches (new object identity) do not wipe in-progress edits.
  }, [existingEntry?.id]);

  const createMutation = useMutation({
    mutationFn: (data: CreateEntryRequest) => createEntry(tripId!, data, accessToken!),
    onSuccess: () => navigate(`/trips/${tripId}/timeline`),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateEntryRequest) =>
      updateEntry(tripId!, entryId!, data, accessToken!),
    onSuccess: () => navigate(`/trips/${tripId}/timeline`),
  });

  const handleFileSelect = useCallback(
    async (files: FileList) => {
      setUploadError('');
      const remaining = 10 - images.length - localFiles.length;
      const toProcess = Array.from(files).slice(0, remaining);

      if (navigator.onLine === false) {
        // Queue raw files for upload during sync
        setLocalFiles((prev) => [...prev, ...toProcess]);
        return;
      }

      setUploadingCount((prev) => prev + toProcess.length);
      await Promise.all(
        toProcess.map(async (file) => {
          try {
            const { blob, width, height } = await compressImage(file);
            const result = await uploadMedia(tripId!, blob, width, height, accessToken!);
            setImages((prev) => [
              ...prev,
              { key: result.key, width, height, order: prev.length, uploadedAt: new Date().toISOString() },
            ]);
          } catch {
            setUploadError(t('entries.uploadFailed'));
          } finally {
            setUploadingCount((prev) => prev - 1);
          }
        }),
      );
    },
    [images.length, localFiles.length, tripId, accessToken, t],
  );

  const handleRemoveLocalFile = useCallback((index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
  }, [form.locationEnabled]);

  const handleDiscard = useCallback(() => {
    if (formIsDirty(form, initialForm, images, initialImages, localFiles)) {
      if (!window.confirm(t('entries.discardConfirm'))) return;
    }
    navigate(`/trips/${tripId}/timeline`);
  }, [form, initialForm, navigate, t, tripId, localFiles]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

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

      if (!valid) return;

      const location =
        form.locationEnabled && form.locationLat !== null && form.locationLng !== null
          ? {
              lat: form.locationLat,
              lng: form.locationLng,
              ...(form.locationName.trim() && { name: form.locationName.trim() }),
            }
          : undefined;

      if (isEdit) {
        updateMutation.mutate({
          title: form.title.trim(),
          content: form.content,
          images,
          location: form.locationEnabled ? (location ?? null) : null,
        });
      } else {
        const createData: CreateEntryRequest = {
          title: form.title.trim(),
          content: form.content,
          images,
          ...(location !== undefined && { location }),
        };

        if (navigator.onLine === false) {
          void saveOfflineEntry({
            localId: crypto.randomUUID(),
            tripId: tripId!,
            status: 'pending',
            payload: createData,
            images: localFiles,
            createdAt: Date.now(),
          });
          setSavedOffline(true);
          setTimeout(() => navigate(`/trips/${tripId}/timeline`), 1500);
          return;
        }

        createMutation.mutate(createData);
      }
    },
    [form, isEdit, createMutation, updateMutation, t, tripId, navigate, localFiles],
  );

  const isPending = createMutation.isPending || updateMutation.isPending || uploadingCount > 0;

  return (
    <div className="min-h-screen bg-bg-primary pb-8">
      <header className="px-4 pt-8 pb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-heading">
          {isEdit ? t('entries.editTitle') : t('entries.newTitle')}
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        {/* Title */}
        <div>
          <label className="block font-ui text-sm font-medium text-body mb-1" htmlFor="entry-title">
            {t('entries.titleLabel')}
          </label>
          <input
            id="entry-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 bg-bg-secondary border border-caption/30 rounded-round-eight font-ui text-body focus:outline-none focus:border-accent"
            placeholder={t('entries.titlePlaceholder')}
          />
          {titleError && (
            <p className="mt-1 font-ui text-xs text-red-500" role="alert">
              {titleError}
            </p>
          )}
        </div>

        {/* Content */}
        <div>
          <label className="block font-ui text-sm font-medium text-body mb-1" htmlFor="entry-content">
            {t('entries.contentLabel')}
          </label>
          <textarea
            id="entry-content"
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            rows={8}
            className="w-full px-3 py-2 bg-bg-secondary border border-caption/30 rounded-round-eight font-ui text-body focus:outline-none focus:border-accent resize-none"
            placeholder={t('entries.contentPlaceholder')}
          />
          {contentError && (
            <p className="mt-1 font-ui text-xs text-red-500" role="alert">
              {contentError}
            </p>
          )}
        </div>

        {/* Images */}
        <div>
          <label
            className="block font-ui text-sm font-medium text-body mb-1"
            htmlFor="entry-media-input"
          >
            {t('entries.photosSection')}
          </label>
          <ImageReorder
            images={images}
            onImagesChange={setImages}
            onFileSelect={handleFileSelect}
            isUploading={uploadingCount > 0}
          />
          {/* Offline-queued photos pending upload */}
          {localPreviews.length > 0 && (
            <div className="mt-2">
              <p className="font-ui text-xs text-caption mb-1">{t('offline.saved')}</p>
              <div className="flex flex-wrap gap-2">
                {localPreviews.map((src, i) => (
                  <div key={src} className="relative">
                    <img
                      src={src}
                      alt=""
                      className="w-16 h-16 object-cover rounded opacity-60"
                    />
                    <button
                      type="button"
                      aria-label={t('entries.removeImage')}
                      onClick={() => handleRemoveLocalFile(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {uploadError && (
            <p className="mt-2 font-ui text-xs text-red-500" role="alert">
              {uploadError}
            </p>
          )}
        </div>

        {/* Location toggle */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.locationEnabled}
              onChange={handleLocationToggle}
              className="w-4 h-4 accent-accent"
            />
            <span className="font-ui text-sm text-body">{t('entries.locationToggle')}</span>
          </label>

          {form.locationEnabled && (
            <div className="mt-2 space-y-2">
              {form.locationLat !== null && form.locationLng !== null && (
                <p className="font-ui text-xs text-caption">
                  {form.locationLat.toFixed(5)}, {form.locationLng.toFixed(5)}
                </p>
              )}
              <input
                type="text"
                value={form.locationName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, locationName: e.target.value }))
                }
                className="w-full px-3 py-2 bg-bg-secondary border border-caption/30 rounded-round-eight font-ui text-sm text-body focus:outline-none focus:border-accent"
                placeholder={t('entries.locationNamePlaceholder')}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 py-2 bg-accent text-white font-ui font-semibold rounded-round-eight hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="flex-1 py-2 bg-bg-secondary text-body font-ui font-semibold rounded-round-eight border border-caption/30 hover:border-accent/40 transition-all"
          >
            {t('common.cancel')}
          </button>
        </div>

        {savedOffline && (
          <p className="font-ui text-xs text-green-600 text-center" role="status">
            {t('offline.saved')}
          </p>
        )}
        {!savedOffline && (createMutation.isError || updateMutation.isError) && (
          <p className="font-ui text-xs text-red-500 text-center">{t('common.error')}</p>
        )}
      </form>
    </div>
  );
}
