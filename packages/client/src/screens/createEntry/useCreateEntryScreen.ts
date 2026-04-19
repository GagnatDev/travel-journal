import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  CreateEntryRequest,
  EntryImage,
  EntryLocation,
  UpdateEntryRequest,
} from '@travel-journal/shared';

import { createEntry, fetchEntry, updateEntry } from '../../api/entries.js';
import { uploadMedia } from '../../api/media.js';
import { useAuth } from '../../context/AuthContext.js';
import { compressImage } from '../../utils/compressImage.js';
import { extractImageGps } from '../../utils/extractImageGps.js';
import { getPendingEntry } from '../../offline/db.js';
import { saveOfflineEntry } from '../../offline/entrySync.js';
import { QUERY_STALE_MS } from '../../lib/appQueryClient.js';

import { EMPTY_ENTRY_FORM, type EntryFormState } from './entryFormState.js';
import { useEntryForm } from './useEntryForm.js';

function firstImageByOrder(images: EntryImage[]): EntryImage | undefined {
  return [...images].sort((a, b) => a.order - b.order)[0];
}

export function useCreateEntryScreen() {
  const { id: tripId, entryId, localId: pendingLocalId } = useParams<{
    id: string;
    entryId?: string;
    localId?: string;
  }>();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
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
  const [gpsByMediaKey, setGpsByMediaKey] = useState<Record<string, { lat: number; lng: number } | null>>(
    {},
  );
  const [offlineFirstPhotoGps, setOfflineFirstPhotoGps] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [submitBusy, setSubmitBusy] = useState(false);

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
    setGpsByMediaKey({});
    setOfflineFirstPhotoGps(null);
  }, [tripId, location.pathname]);

  useEffect(() => {
    setGpsByMediaKey((prev) => {
      const keys = new Set(images.map((i) => i.key));
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!keys.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [images]);

  useEffect(() => {
    if (images.length > 0) {
      setOfflineFirstPhotoGps(null);
      return;
    }
    if (localFiles.length === 0) {
      setOfflineFirstPhotoGps(null);
      return;
    }
    let cancelled = false;
    void extractImageGps(localFiles[0]!).then((g) => {
      if (!cancelled) setOfflineFirstPhotoGps(g);
    });
    return () => {
      cancelled = true;
    };
  }, [images.length, localFiles]);

  const { data: existingEntry } = useQuery({
    queryKey: ['entry', tripId, entryId],
    queryFn: () => fetchEntry(tripId!, entryId!, accessToken!),
    enabled: isServerEdit && !!accessToken && !!tripId && !!entryId,
    staleTime: QUERY_STALE_MS.entryEditor,
  });

  useEffect(() => {
    if (!existingEntry) return;
    const loaded: EntryFormState = {
      title: existingEntry.title,
      content: existingEntry.content,
      locationSource: existingEntry.location ? 'device' : 'off',
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
    setGpsByMediaKey({});
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
        locationSource: p.payload.location ? 'device' : 'off',
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
      setGpsByMediaKey({});
    });

    return () => {
      cancelled = true;
    };
  }, [isPendingEdit, tripId, pendingLocalId, navigate]);

  const createMutation = useMutation({
    mutationFn: (data: CreateEntryRequest) => createEntry(tripId!, data, accessToken!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entries', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['entryLocations', tripId] }),
      ]);
      navigate(`/trips/${tripId}/timeline`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateEntryRequest) =>
      updateEntry(tripId!, entryId!, data, accessToken!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entries', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['entryLocations', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['entry', tripId, entryId] }),
      ]);
      navigate(`/trips/${tripId}/timeline`);
    },
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
            const gpsResult = await extractImageGps(file);
            const { blob, width, height } = await compressImage(file);
            const result = await uploadMedia(tripId!, blob, width, height, accessToken!);
            setGpsByMediaKey((prev) => ({ ...prev, [result.key]: gpsResult }));
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

  const resolveSubmitLocation = useCallback(async (): Promise<EntryLocation | undefined> => {
    if (form.locationSource === 'off') return undefined;

    const name = form.locationName.trim() ? form.locationName.trim() : undefined;

    if (form.locationSource === 'device') {
      if (form.locationLat !== null && form.locationLng !== null) {
        return {
          lat: form.locationLat,
          lng: form.locationLng,
          ...(name !== undefined && { name }),
        };
      }
      return undefined;
    }

    const first = firstImageByOrder(images);
    let coords: { lat: number; lng: number } | null = null;
    if (first) {
      coords = gpsByMediaKey[first.key] ?? null;
    } else if (localFiles[0]) {
      coords = await extractImageGps(localFiles[0]);
    }

    if (!coords) return undefined;
    return {
      lat: coords.lat,
      lng: coords.lng,
      ...(name !== undefined && { name }),
    };
  }, [form.locationSource, form.locationLat, form.locationLng, form.locationName, images, localFiles, gpsByMediaKey]);

  const exifPreviewCoords = useMemo((): { lat: number; lng: number } | null => {
    if (form.locationSource !== 'exif') return null;
    const first = firstImageByOrder(images);
    if (first) {
      return gpsByMediaKey[first.key] ?? null;
    }
    return offlineFirstPhotoGps;
  }, [form.locationSource, images, gpsByMediaKey, offlineFirstPhotoGps]);

  const { handleLocationSourceChange, handleDiscard, validateRequiredFields } = useEntryForm(
    form,
    setForm,
    initialForm,
    images,
    initialImages,
    localFiles,
    initialLocalFiles,
    setTitleError,
    setContentError,
    t,
    navigate,
    tripId,
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateRequiredFields()) return;

      setSubmitBusy(true);
      try {
        const location = await resolveSubmitLocation();

        const createData: CreateEntryRequest = {
          title: form.title.trim(),
          content: form.content,
          images,
          ...(location !== undefined && { location }),
        };

        if (isServerEdit) {
          await updateMutation.mutateAsync({
            title: form.title.trim(),
            content: form.content,
            images,
            location: form.locationSource !== 'off' ? (location ?? null) : null,
          });
          return;
        }

        if (isPendingEdit) {
          if (!pendingOfflineMeta) return;
          await saveOfflineEntry({
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
          await saveOfflineEntry({
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

        await createMutation.mutateAsync(createData);
      } finally {
        setSubmitBusy(false);
      }
    },
    [
      form,
      isServerEdit,
      isPendingEdit,
      pendingOfflineMeta,
      createMutation,
      updateMutation,
      tripId,
      navigate,
      localFiles,
      images,
      validateRequiredFields,
      resolveSubmitLocation,
    ],
  );

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadingCount > 0 ||
    submitBusy ||
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
    handleLocationSourceChange,
    exifPreviewCoords,
    handleSubmit,
    handleDiscard,
    isPending,
    savedOffline,
    createMutationError: createMutation.isError,
    updateMutationError: updateMutation.isError,
  };
}
