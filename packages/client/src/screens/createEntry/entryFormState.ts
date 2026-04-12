import type { EntryImage } from '@travel-journal/shared';

export interface EntryFormState {
  title: string;
  content: string;
  locationEnabled: boolean;
  locationLat: number | null;
  locationLng: number | null;
  locationName: string;
}

export const EMPTY_ENTRY_FORM: EntryFormState = {
  title: '',
  content: '',
  locationEnabled: false,
  locationLat: null,
  locationLng: null,
  locationName: '',
};

export function entryFormIsDirty(
  form: EntryFormState,
  initial: EntryFormState,
  images: EntryImage[],
  initialImages: EntryImage[],
  localFiles: File[],
  initialLocalFiles: File[],
): boolean {
  const imagesDirty =
    images.length !== initialImages.length ||
    images.some((img, i) => img.key !== initialImages[i]?.key);
  const localFilesDirty =
    localFiles.length !== initialLocalFiles.length ||
    localFiles.some(
      (f, i) =>
        f.name !== initialLocalFiles[i]?.name || f.size !== initialLocalFiles[i]?.size,
    );
  return (
    imagesDirty ||
    localFilesDirty ||
    form.title !== initial.title ||
    form.content !== initial.content ||
    form.locationEnabled !== initial.locationEnabled ||
    form.locationLat !== initial.locationLat ||
    form.locationLng !== initial.locationLng ||
    form.locationName !== initial.locationName
  );
}
