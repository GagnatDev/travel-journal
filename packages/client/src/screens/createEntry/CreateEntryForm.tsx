import { useTranslation } from 'react-i18next';
import type { EntryImage } from '@travel-journal/shared';

import { CalendarIcon, CameraIcon, MapPinIcon } from '../../components/icons/index.js';
import { IconBadge } from '../../components/ui/IconBadge.js';
import { PillButton } from '../../components/ui/PillButton.js';
import { ImageReorder } from '../../components/ImageReorder.js';
import { entryTextControlClass } from '../../components/ui/fieldStyles.js';

import type { EntryFormState, EntryLocationSource } from './entryFormState.js';

export interface CreateEntryFormProps {
  form: EntryFormState;
  setForm: React.Dispatch<React.SetStateAction<EntryFormState>>;
  titleError: string;
  contentError: string;
  images: EntryImage[];
  setImages: React.Dispatch<React.SetStateAction<EntryImage[]>>;
  localPreviews: string[];
  handleFileSelect: (files: FileList) => void | Promise<void>;
  uploadingCount: number;
  uploadError: string;
  handleRemoveLocalFile: (index: number) => void;
  handleLocationSourceChange: (source: EntryLocationSource) => void;
  exifPreviewCoords: { lat: number; lng: number } | null;
  handleSubmit: (e: React.FormEvent) => void | Promise<void>;
  handleDiscard: () => void;
  isPending: boolean;
  savedOffline: boolean;
  createMutationError: boolean;
  updateMutationError: boolean;
}

export function CreateEntryForm({
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
  createMutationError,
  updateMutationError,
}: CreateEntryFormProps) {
  const { t } = useTranslation();
  const hasImages = images.length > 0 || localPreviews.length > 0;

  const showLocationDetails = form.locationSource !== 'off';
  const displayLat =
    form.locationSource === 'device' ? form.locationLat : exifPreviewCoords?.lat ?? null;
  const displayLng =
    form.locationSource === 'device' ? form.locationLng : exifPreviewCoords?.lng ?? null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-full">
      {/* Photo upload zone */}
      <div className="relative bg-bg-secondary min-h-[220px] flex flex-col items-center justify-center gap-3 overflow-hidden">
        {hasImages ? (
          <div className="w-full p-4">
            <ImageReorder
              images={images}
              onImagesChange={setImages}
              onFileSelect={handleFileSelect}
              isUploading={uploadingCount > 0}
            />
            {localPreviews.length > 0 && (
              <div className="mt-2">
                <p className="font-ui text-xs text-caption mb-1">{t('offline.saved')}</p>
                <div className="flex flex-wrap gap-2">
                  {localPreviews.map((src, i) => (
                    <div key={src} className="relative">
                      <img src={src} alt="" className="w-16 h-16 object-cover rounded opacity-60" />
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
          </div>
        ) : (
          <>
            {/* Decorative tilted ghost card placeholders */}
            <div
              aria-hidden="true"
              className="absolute bg-bg-primary border-2 border-dashed border-caption/30 rounded-card w-28 h-20 -rotate-3 opacity-60"
              style={{ left: '50%', top: '50%', transform: 'translate(calc(-50% - 20px), calc(-50% + 5px)) rotate(-3deg)' }}
            />
            <div
              aria-hidden="true"
              className="absolute bg-bg-primary border-2 border-dashed border-caption/30 rounded-card w-28 h-20 opacity-60"
              style={{ left: '50%', top: '50%', transform: 'translate(calc(-50% + 20px), calc(-50% - 5px)) rotate(2deg)' }}
            />
            {/* Tap to add photos */}
            <label
              htmlFor="entry-media-input"
              className="relative z-10 flex flex-col items-center gap-2 cursor-pointer"
            >
              <CameraIcon width={28} height={28} className="text-accent" />
              <span className="font-ui text-sm text-caption">{t('entries.addPhotos')}</span>
              <input
                id="entry-media-input"
                data-testid="entry-media-file-input"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) void handleFileSelect(e.target.files);
                }}
              />
            </label>
          </>
        )}
        {uploadError && (
          <p className="font-ui text-xs text-red-500 px-4 text-center" role="alert">
            {uploadError}
          </p>
        )}
      </div>

      {/* Borderless title textarea */}
      <div className="px-4 pt-4 pb-2">
        <textarea
          id="entry-title"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={t('entries.titlePlaceholder')}
          rows={2}
          aria-label={t('entries.titleLabel')}
          aria-invalid={!!titleError}
          aria-describedby={titleError ? 'entry-title-error' : undefined}
          className="font-display text-2xl text-heading placeholder:text-caption/50 bg-transparent border-none outline-none resize-none w-full"
        />
        {titleError && (
          <p id="entry-title-error" role="alert" className="mt-1 font-ui text-xs text-red-500">
            {titleError}
          </p>
        )}
      </div>

      {/* Borderless content textarea */}
      <div className="px-4 pb-4 border-b border-caption/10">
        <textarea
          id="entry-content"
          value={form.content}
          onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
          rows={6}
          placeholder={t('entries.contentPlaceholder')}
          aria-label={t('entries.contentLabel')}
          aria-invalid={!!contentError}
          aria-describedby={contentError ? 'entry-content-error' : undefined}
          className="font-ui text-base text-body placeholder:text-caption/50 bg-transparent border-none outline-none resize-none w-full"
        />
        {contentError && (
          <p id="entry-content-error" role="alert" className="mt-1 font-ui text-xs text-red-500">
            {contentError}
          </p>
        )}
      </div>

      {/* Date metadata row */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-caption/10">
        <IconBadge>
          <CalendarIcon width={16} height={16} className="text-body" />
        </IconBadge>
        <div>
          <p className="font-ui text-xs text-caption uppercase tracking-wide">{t('entries.entryDate', 'Entry Date')}</p>
          <p className="font-ui text-sm text-body mt-0.5">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Location metadata row */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-caption/10">
        <IconBadge>
          <MapPinIcon width={16} height={16} className="text-body" />
        </IconBadge>
        <fieldset className="flex-1 min-w-0 border-0 p-0 m-0">
          <legend className="font-ui text-xs text-caption uppercase tracking-wide mb-2">
            {t('entries.locationSectionLabel')}
          </legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer font-ui text-sm text-body">
              <input
                type="radio"
                name="entry-location-source"
                checked={form.locationSource === 'off'}
                onChange={() => handleLocationSourceChange('off')}
                className="w-4 h-4 accent-accent shrink-0"
                aria-label={t('entries.locationSourceOff')}
              />
              <span>{t('entries.locationSourceOff')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-ui text-sm text-body">
              <input
                type="radio"
                name="entry-location-source"
                checked={form.locationSource === 'device'}
                onChange={() => handleLocationSourceChange('device')}
                className="w-4 h-4 accent-accent shrink-0"
                aria-label={t('entries.locationSourceDevice')}
              />
              <span>{t('entries.locationSourceDevice')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-ui text-sm text-body">
              <input
                type="radio"
                name="entry-location-source"
                checked={form.locationSource === 'exif'}
                onChange={() => handleLocationSourceChange('exif')}
                className="w-4 h-4 accent-accent shrink-0"
                aria-label={t('entries.locationSourceExif')}
              />
              <span>{t('entries.locationSourceExif')}</span>
            </label>
          </div>
          {showLocationDetails && (
            <div className="mt-2 space-y-1">
              {form.locationSource === 'exif' && (
                <p className="font-ui text-xs text-caption">{t('entries.locationFromPhotoHint')}</p>
              )}
              {displayLat !== null && displayLng !== null && (
                <p className="font-ui text-xs text-caption">
                  {displayLat.toFixed(5)}, {displayLng.toFixed(5)}
                </p>
              )}
              <input
                id="entry-location-name"
                type="text"
                value={form.locationName}
                onChange={(e) => setForm((prev) => ({ ...prev, locationName: e.target.value }))}
                className={`w-full text-sm ${entryTextControlClass}`}
                placeholder={t('entries.locationNamePlaceholder')}
              />
            </div>
          )}
        </fieldset>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 mt-auto space-y-3">
        {savedOffline && (
          <p className="font-ui text-xs text-green-600 text-center" role="status">
            {t('offline.saved')}
          </p>
        )}
        {!savedOffline && (createMutationError || updateMutationError) && (
          <p className="font-ui text-xs text-red-500 text-center">{t('common.error')}</p>
        )}
        <button
          type="button"
          onClick={handleDiscard}
          className="font-ui text-xs text-caption w-full text-center hover:text-heading transition-colors"
        >
          {t('common.cancel')}
        </button>
        <PillButton type="submit" fullWidth disabled={isPending}>
          {t('entries.saveEntry')}
        </PillButton>
      </div>
    </form>
  );
}
