import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  ComposeFromSavedLocationPayload,
  CreateEntryRequest,
  EntryImage,
  UpdateEntryRequest,
} from '@travel-journal/shared';

import { createEntry, fetchEntry, updateEntry } from '../../api/entries.js';
import { uploadMedia } from '../../api/media.js';
import { useAuth } from '../../context/AuthContext.js';
import { compressImage } from '../../utils/compressImage.js';
import { uploadEntryLocalFiles } from '../../utils/uploadEntryLocalFiles.js';
import { getPendingEntry } from '../../offline/db.js';
import { saveOfflineEntry } from '../../offline/entrySync.js';
import { QUERY_STALE_MS } from '../../lib/appQueryClient.js';
import { setUnsavedChanges } from '../../lib/unsavedChanges.js';
import { tripSettingsQueryKeys } from '../tripSettings/useTripSettings.js';
import { EMPTY_ENTRY_FORM, entryFormIsDirty, type EntryFormState } from './entryFormState.js';
import { formatComposerEntryDate } from './formatComposerEntryDate.js';
import { useEntryForm } from './useEntryForm.js';

export function useCreateEntryScreen() {
  const { id: tripId, entryId, localId: pendingLocalId } = useParams<{
    id: string;
    entryId?: string;
    localId?: string;
  }>();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
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
  const [uploadSession, setUploadSession] = useState<{
    total: number;
    remaining: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [savedOffline, setSavedOffline] = useState(false);
  const [isFlushingLocalUploads, setIsFlushingLocalUploads] = useState(false);
  const [flushUploadProgress, setFlushUploadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  /** Calendar anchor for new drafts — reset when opening the new-entry route. */
  const [newComposerDate, setNewComposerDate] = useState(() => new Date());
  const [linkedSavedLocationId, setLinkedSavedLocationId] = useState<string | null>(null);

  const localPreviews = useMemo(
    () => localFiles.map((f) => URL.createObjectURL(f)),
    [localFiles],
  );

  useEffect(() => {
    return () => {
      localPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localPreviews]);

  // Surface the composer's dirty state globally so a pending PWA update can warn
  // before reloading and discarding an in-progress entry. Reset on unmount.
  useEffect(() => {
    setUnsavedChanges(
      entryFormIsDirty(form, initialForm, images, initialImages, localFiles, initialLocalFiles),
    );
    return () => setUnsavedChanges(false);
  }, [form, initialForm, images, initialImages, localFiles, initialLocalFiles]);

  useEffect(() => {
    if (!tripId || !location.pathname.endsWith('/entries/new')) return;
    const routerState = location.state as { fromSavedLocation?: ComposeFromSavedLocationPayload } | null;
    const fromSaved = routerState?.fromSavedLocation;

    setPendingOfflineMeta(null);

    let nextInitial: EntryFormState = EMPTY_ENTRY_FORM;
    if (
      fromSaved !== undefined &&
      fromSaved.savedLocationId !== '' &&
      !Number.isNaN(fromSaved.lat) &&
      !Number.isNaN(fromSaved.lng)
    ) {
      setLinkedSavedLocationId(fromSaved.savedLocationId);
      nextInitial = {
        ...EMPTY_ENTRY_FORM,
        locationEnabled: true,
        locationLat: fromSaved.lat,
        locationLng: fromSaved.lng,
        locationName: fromSaved.name?.trim() ? fromSaved.name.trim() : '',
      };
    } else {
      setLinkedSavedLocationId(null);
    }

    setForm(nextInitial);
    setInitialForm(nextInitial);
    setImages([]);
    setInitialImages([]);
    setLocalFiles([]);
    setInitialLocalFiles([]);
    setSavedOffline(false);
    setNewComposerDate(new Date());
  }, [tripId, location.pathname, location.key]);

  const { data: existingEntry } = useQuery({
    queryKey: ['entry', tripId, entryId],
    queryFn: () => fetchEntry(tripId!, entryId!, accessToken!),
    enabled: isServerEdit && !!accessToken && !!tripId && !!entryId,
    staleTime: QUERY_STALE_MS.entryEditor,
  });

  const entryDateLabel = useMemo(() => {
    if (isServerEdit) {
      if (!existingEntry) return null;
      return formatComposerEntryDate(existingEntry.createdAt, i18n.language);
    }
    if (isPendingEdit) {
      if (!pendingOfflineMeta) return null;
      return formatComposerEntryDate(pendingOfflineMeta.createdAt, i18n.language);
    }
    return formatComposerEntryDate(newComposerDate.getTime(), i18n.language);
  }, [
    isServerEdit,
    isPendingEdit,
    existingEntry,
    pendingOfflineMeta,
    newComposerDate,
    i18n.language,
  ]);

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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entries', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['mapPins', tripId] }),
        queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trip(tripId) }),
        queryClient.invalidateQueries({ queryKey: tripSettingsQueryKeys.trips }),
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
        queryClient.invalidateQueries({ queryKey: ['mapPins', tripId] }),
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

      if (toProcess.length > 0) {
        setUploadSession((prev) => {
          const n = toProcess.length;
          if (!prev) return { total: n, remaining: n };
          return { total: prev.total + n, remaining: prev.remaining + n };
        });
      }
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
            setLocalFiles((prev) => [...prev, file]);
            setUploadError(t('entries.uploadQueuedOffline'));
          } finally {
            setUploadSession((prev) => {
              if (!prev) return null;
              const nextRem = prev.remaining - 1;
              if (nextRem <= 0) return null;
              return { total: prev.total, remaining: nextRem };
            });
          }
        }),
      );
    },
    [images.length, localFiles.length, tripId, accessToken, t],
  );

  const queueOfflineAfterNetworkFailure = useCallback(
    (payload: CreateEntryRequest, files: File[]) => {
      void saveOfflineEntry({
        localId: crypto.randomUUID(),
        tripId: tripId!,
        status: 'pending',
        payload,
        images: files,
        createdAt: Date.now(),
      });
      setSavedOffline(true);
      setTimeout(() => navigate(`/trips/${tripId}/timeline`), 1500);
    },
    [navigate, tripId],
  );

  const handleRemoveLocalFile = useCallback((index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const {
    handleLocationToggle: toggleLocationInner,
    handleDiscard,
    validateRequiredFields,
  } = useEntryForm(
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

  const handleLocationToggle = useCallback(() => {
    if (form.locationEnabled) {
      setLinkedSavedLocationId(null);
    }
    toggleLocationInner();
  }, [form.locationEnabled, toggleLocationInner]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateRequiredFields()) return;

      const location =
        form.locationEnabled && form.locationLat !== null && form.locationLng !== null
          ? {
              lat: form.locationLat,
              lng: form.locationLng,
              ...(form.locationName.trim() && { name: form.locationName.trim() }),
            }
          : undefined;

      const consumeBookmark =
        linkedSavedLocationId !== null &&
        form.locationEnabled &&
        form.locationLat !== null &&
        form.locationLng !== null;

      const buildCreatePayload = (imageList: EntryImage[]): CreateEntryRequest => ({
        title: form.title.trim(),
        content: form.content,
        images: imageList,
        ...(location !== undefined && { location }),
        ...(consumeBookmark && { consumedSavedLocationId: linkedSavedLocationId! }),
      });

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
          payload: buildCreatePayload(images),
          images: localFiles,
          createdAt: pendingOfflineMeta.createdAt,
        });
        setSavedOffline(true);
        setTimeout(() => navigate(`/trips/${tripId}/timeline`), 1500);
        return;
      }

      // Queue offline when the browser reports no connection OR when we have no
      // access token yet (session is being resumed offline after a flaky-network
      // startup). Both mean we can't reach the API right now — save locally and
      // let the background sync flush once connectivity and a token are restored.
      if (navigator.onLine === false || !accessToken) {
        void saveOfflineEntry({
          localId: crypto.randomUUID(),
          tripId: tripId!,
          status: 'pending',
          payload: buildCreatePayload(images),
          images: localFiles,
          createdAt: Date.now(),
        });
        setSavedOffline(true);
        setTimeout(() => navigate(`/trips/${tripId}/timeline`), 1500);
        return;
      }

      if (!tripId) return;

      setUploadError('');
      createMutation.reset();

      let nextImages = images;
      let nextLocalFiles = localFiles;

      if (nextLocalFiles.length > 0) {
        setIsFlushingLocalUploads(true);
        setFlushUploadProgress({ completed: 0, total: nextLocalFiles.length });
        try {
          const result = await uploadEntryLocalFiles(
            tripId,
            accessToken,
            nextImages,
            nextLocalFiles,
            (completed, total) => setFlushUploadProgress({ completed, total }),
          );
          nextImages = result.images;
          nextLocalFiles = result.failedFiles;
          setImages(nextImages);
          setLocalFiles(nextLocalFiles);
          if (result.failedFiles.length > 0) {
            setUploadError(t('entries.uploadQueuedOffline'));
            queueOfflineAfterNetworkFailure(buildCreatePayload(nextImages), nextLocalFiles);
            return;
          }
        } finally {
          setIsFlushingLocalUploads(false);
          setFlushUploadProgress(null);
        }
      }

      const createData = buildCreatePayload(nextImages);

      try {
        await createMutation.mutateAsync(createData);
      } catch {
        queueOfflineAfterNetworkFailure(createData, nextLocalFiles);
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
      accessToken,
      queueOfflineAfterNetworkFailure,
      t,
      linkedSavedLocationId,
    ],
  );

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadSession !== null ||
    isFlushingLocalUploads ||
    (isPendingEdit && !pendingOfflineMeta);

  const uploadProgress =
    uploadSession !== null
      ? {
          completed: uploadSession.total - uploadSession.remaining,
          total: uploadSession.total,
          phase: 'adding' as const,
        }
      : flushUploadProgress !== null
        ? { ...flushUploadProgress, phase: 'finishing' as const }
        : null;

  return {
    isServerEdit,
    isPendingEdit,
    entryDateLabel,
    form,
    setForm,
    titleError,
    contentError,
    images,
    setImages,
    localPreviews,
    handleFileSelect,
    uploadProgress,
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
