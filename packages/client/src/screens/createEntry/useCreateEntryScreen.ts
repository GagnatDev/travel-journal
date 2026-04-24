import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CreateEntryRequest, EntryImage, TripRole, UpdateEntryRequest } from '@travel-journal/shared';

import { createEntry, fetchEntry, updateEntry } from '../../api/entries.js';
import { fetchTrip } from '../../api/trips.js';
import { uploadMedia } from '../../api/media.js';
import { useAuth } from '../../context/AuthContext.js';
import { compressImage } from '../../utils/compressImage.js';
import { uploadEntryLocalFiles } from '../../utils/uploadEntryLocalFiles.js';
import { getPendingEntry } from '../../offline/db.js';
import { saveOfflineEntry } from '../../offline/entrySync.js';
import { QUERY_STALE_MS } from '../../lib/appQueryClient.js';

import { EMPTY_ENTRY_FORM, type EntryFormState } from './entryFormState.js';
import { useEntryForm } from './useEntryForm.js';

export function useCreateEntryScreen() {
  const { id: tripId, entryId, localId: pendingLocalId } = useParams<{
    id: string;
    entryId?: string;
    localId?: string;
  }>();
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isPendingEdit = Boolean(pendingLocalId);
  const isServerEdit = Boolean(entryId) && !isPendingEdit;
  const isOnlineCreate = !isServerEdit && !isPendingEdit;

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
  const [isFlushingLocalUploads, setIsFlushingLocalUploads] = useState(false);
  /** New entry (server): draft = collaborators only; published = followers see it. */
  const [createPublicationStatus, setCreatePublicationStatus] = useState<'draft' | 'published'>(
    'published',
  );
  /** Edit server draft: when true, PATCH includes publicationStatus published. */
  const [publishForFollowersOnSave, setPublishForFollowersOnSave] = useState(false);

  const { data: tripForRole } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTrip(tripId!, accessToken!),
    enabled: isOnlineCreate && !!accessToken && !!tripId,
    staleTime: QUERY_STALE_MS.tripDetail,
  });

  const myTripRole: TripRole | undefined = useMemo(() => {
    if (!tripForRole || !user?.id) return undefined;
    return tripForRole.members.find((m) => m.userId === user.id)?.tripRole;
  }, [tripForRole, user?.id]);

  const canChoosePublicationOnCreate =
    isOnlineCreate &&
    (myTripRole === 'creator' || myTripRole === 'contributor' || myTripRole === undefined);

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
    setCreatePublicationStatus('published');
    setPublishForFollowersOnSave(false);
  }, [tripId, location.pathname]);

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
    setPublishForFollowersOnSave(false);
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
            setUploadingCount((prev) => prev - 1);
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

  const { handleLocationToggle, handleDiscard, validateRequiredFields } = useEntryForm(
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

      const location =
        form.locationEnabled && form.locationLat !== null && form.locationLng !== null
          ? {
              lat: form.locationLat,
              lng: form.locationLng,
              ...(form.locationName.trim() && { name: form.locationName.trim() }),
            }
          : undefined;

      const buildCreatePayload = (imageList: EntryImage[]): CreateEntryRequest => ({
        title: form.title.trim(),
        content: form.content,
        images: imageList,
        ...(location !== undefined && { location }),
        ...(navigator.onLine !== false &&
          canChoosePublicationOnCreate && { publicationStatus: createPublicationStatus }),
      });

      if (isServerEdit) {
        const patch: UpdateEntryRequest = {
          title: form.title.trim(),
          content: form.content,
          images,
          location: form.locationEnabled ? (location ?? null) : null,
        };
        if (existingEntry?.publicationStatus === 'draft' && publishForFollowersOnSave) {
          patch.publicationStatus = 'published';
        }
        updateMutation.mutate(patch);
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

      if (navigator.onLine === false) {
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

      if (!tripId || !accessToken) return;

      setUploadError('');
      createMutation.reset();

      let nextImages = images;
      let nextLocalFiles = localFiles;

      if (nextLocalFiles.length > 0) {
        setIsFlushingLocalUploads(true);
        try {
          const result = await uploadEntryLocalFiles(
            tripId,
            accessToken,
            nextImages,
            nextLocalFiles,
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
      canChoosePublicationOnCreate,
      createPublicationStatus,
      publishForFollowersOnSave,
      existingEntry?.publicationStatus,
    ],
  );

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadingCount > 0 ||
    isFlushingLocalUploads ||
    (isPendingEdit && !pendingOfflineMeta);

  const isServerDraftEdit =
    isServerEdit && existingEntry?.publicationStatus === 'draft';
  /** Anyone who can load this draft from the API may publish (creators/contributors only server-side). */
  const showCollaboratorPublishOnEdit = Boolean(isServerDraftEdit);

  return {
    isServerEdit,
    isPendingEdit,
    isServerDraftEdit,
    canChoosePublicationOnCreate,
    createPublicationStatus,
    setCreatePublicationStatus,
    publishForFollowersOnSave,
    setPublishForFollowersOnSave,
    showCollaboratorPublishOnEdit,
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
