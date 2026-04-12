import { useTranslation } from 'react-i18next';
import type { EntryImage } from '@travel-journal/shared';

import { ImageReorder } from '../../components/ImageReorder.js';
import { entryTextControlClass } from '../../components/ui/fieldStyles.js';
import { TextArea } from '../../components/ui/TextArea.js';
import { TextField } from '../../components/ui/TextField.js';

import type { EntryFormState } from './entryFormState.js';

interface EntryFormBodyProps {
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
  handleLocationToggle: () => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleDiscard: () => void;
  isPending: boolean;
  savedOffline: boolean;
  createMutationError: boolean;
  updateMutationError: boolean;
}

export function EntryFormBody({
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
  createMutationError,
  updateMutationError,
}: EntryFormBodyProps) {
  const { t } = useTranslation();

  return (
    <form onSubmit={handleSubmit} className="px-4 space-y-4">
      <TextField
        label={t('entries.titleLabel')}
        labelHtmlFor="entry-title"
        type="text"
        value={form.title}
        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        placeholder={t('entries.titlePlaceholder')}
        variant="entry"
        error={titleError}
        errorId="entry-title-error"
      />

      <TextArea
        label={t('entries.contentLabel')}
        labelHtmlFor="entry-content"
        value={form.content}
        onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
        rows={8}
        placeholder={t('entries.contentPlaceholder')}
        variant="entry"
        className="resize-none"
        error={contentError}
        errorId="entry-content-error"
      />

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
        {uploadError && (
          <p className="mt-2 font-ui text-xs text-red-500" role="alert">
            {uploadError}
          </p>
        )}
      </div>

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
              id="entry-location-name"
              type="text"
              value={form.locationName}
              onChange={(e) => setForm((prev) => ({ ...prev, locationName: e.target.value }))}
              className={`w-full text-sm ${entryTextControlClass}`}
              placeholder={t('entries.locationNamePlaceholder')}
            />
          </div>
        )}
      </div>

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
      {!savedOffline && (createMutationError || updateMutationError) && (
        <p className="font-ui text-xs text-red-500 text-center">{t('common.error')}</p>
      )}
    </form>
  );
}
