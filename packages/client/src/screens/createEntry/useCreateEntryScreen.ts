import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CreateEntryRequest, EntryImage, UpdateEntryRequest } from '@travel-journal/shared';

import { createEntry, fetchEntry, updateEntry } from '../../api/entries.js';
import { uploadMedia } from '../../api/media.js';
import { useAuth } from '../../context/AuthContext.js';
import { compressImage } from '../../utils/compressImage.js';
import { getPendingEntry } from '../../offline/db.js';
import { saveOfflineEntry } from '../../offline/entrySync.js';

import { EMPTY_ENTRY_FORM, entryFormIsDirty, type EntryFormState } from './entryFormState.js';

export function useCreateEntryScreen() {
  const { id: tripId, entryId, localId: pendingLocalId } = useParams<{
    id: string;
    entryId?: string;
    localId?: string;
  }>();
  const { accessToken } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isPendingEdit = Boolean(pendingLocalId);
  const isServerEdit = Boolean(entryId) && !isPendingEdit;

  const [form, setForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const [initialForm, setInitialForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');
  const [images, setImages] = useState<EntryImage[]>([]);
  const [initialImages, setInitialImages] = useState<EntryImage[]>([]);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [initialLocalFiles, setInitialLocalFiles] = useState<File[]>([]);
  const [pendingOfflineMeta, setPendingOfflineMeta] = useState<{
    localId: string;
    createdAt: number;
  } | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [savedOffline, setSavedOffline] = useState(false);

  const localPreviews = useMemo(
    () => localFiles.map((f) => URL.createObjectURL(f)),
    [localFiles],
  );

  useEffect(() => {
    return () => {
      localPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localPreviews]);

  useEffect(() => {
    if (!tripId || !location.pathname.endsWith('/entries/new')) return;
    setPendingOfflineMeta(null);
    setForm(EMPTY_ENTRY_FORM);
    setInitialForm(EMPTY_ENTRY_FORM);
    setImages([]);
    setInitialImages([]);
    setLocalFiles([]);
    setInitialLocalFiles([]);
    setSavedOffline(false);
  }, [tripId, location.pathname]);

  const { data: existingEntry } = useQuery({
    queryKey: ['entry', tripId, entryId],
    queryFn: () => fetchEntry(tripId!, entryId!, accessToken!),
    enabled: isServerEdit && !!accessToken && !!tripId && !!entryId,
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
    setLocalFiles([]);
    setInitialLocalFiles([]);
  }, [existingEntry?.id]);

  useEffect(() => {
    if (!isPendingEdit || !tripId || !pendingLocalId) return;
    let cancelled = false;

    void getPendingEntry(pendingLocalId).then((p) => {
      if (cancelled) return;
      if (!p || p.tripId !== tripId) {
        navigate(`/trips/${tripId}/timeline`, { replace: true });
        return;
      }
      setPendingOfflineMeta({ localId: p.localId, createdAt: p.createdAt });
      const loaded: EntryFormState = {
        title: p.payload.title,
        content: p.payload.content,
        locationEnabled: !!p.payload.location,
        locationLat: p.payload.location?.lat ?? null,
        locationLng: p.payload.location?.lng ?? null,
        locationName: p.payload.location?.name ?? '',
      };
      setForm(loaded);
      setInitialForm(loaded);
      const loadedImages = p.payload.images ?? [];
      setImages(loadedImages);
      setInitialImages(loadedImages);
      const files = [...p.images];
      setLocalFiles(files);
      setInitialLocalFiles(files);
    });

    return () => {
      cancelled = true;
    };
  }, [isPendingEdit, tripId, pendingLocalId, navigate]);

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
              {
                key: result.key,
                ...(result.thumbnailKey !== undefined && { thumbnailKey: result.thumbnailKey }),
                width,
                height,
                order: prev.length,
                uploadedAt: new Date().toISOString(),
              },
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
    if (
      entryFormIsDirty(form, initialForm, images, initialImages, localFiles, initialLocalFiles)
    ) {
      if (!window.confirm(t('entries.discardConfirm'))) return;
    }
    navigate(`/trips/${tripId}/timeline`);
  }, [form, initialForm, images, initialImages, localFiles, initialLocalFiles, navigate, t, tripId]);

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

      const createData: CreateEntryRequest = {
        title: form.title.trim(),
        content: form.content,
        images,
        ...(location !== undefined && { location }),
      };

      if (isServerEdit) {
        updateMutation.mutate({
          title: form.title.trim(),
          content: form.content,
          images,
          location: form.locationEnabled ? (location ?? null) : null,
        });
        return;
      }

      if (isPendingEdit) {
        if (!pendingOfflineMeta) return;
        void saveOfflineEntry({
          localId: pendingOfflineMeta.localId,
          tripId: tripId!,
          status: 'pending',
          payload: createData,
          images: localFiles,
          createdAt: pendingOfflineMeta.createdAt,
        });
        setSavedOffline(true);
        setTimeout(() => navigate(`/trips/${tripId}/timeline`), 1500);
        return;
      }

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
    },
    [
      form,
      isServerEdit,
      isPendingEdit,
      pendingOfflineMeta,
      createMutation,
      updateMutation,
      t,
      tripId,
      navigate,
      localFiles,
      images,
    ],
  );

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadingCount > 0 ||
    (isPendingEdit && !pendingOfflineMeta);

  return {
    isServerEdit,
    isPendingEdit,
    form,
    setForm,
    titleError,
    contentError,
    images,
    setImages,
    localPreviews,
    handleFileSelect,
    uploadingCount,
    uploadError,
    handleRemoveLocalFile,
    handleLocationToggle,
    handleSubmit,
    handleDiscard,
    isPending,
    savedOffline,
    createMutationError: createMutation.isError,
    updateMutationError: updateMutation.isError,
  };
}
