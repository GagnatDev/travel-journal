import { useTranslation } from 'react-i18next';
import type { EntryImage } from '@travel-journal/shared';

import { CalendarIcon, CameraIcon, MapPinIcon } from '../../components/icons/index.js';
import { IconBadge } from '../../components/ui/IconBadge.js';
import { PillButton } from '../../components/ui/PillButton.js';
import { ImageReorder } from '../../components/ImageReorder.js';
import { entryTextControlClass } from '../../components/ui/fieldStyles.js';

import type { EntryFormState } from './entryFormState.js';

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
  handleLocationToggle: () => void;
  handleSubmit: (e: React.FormEvent) => void | Promise<void>;
  handleDiscard: () => void;
  isPending: boolean;
  savedOffline: boolean;
  createMutationError: boolean;
  updateMutationError: boolean;
  isServerEdit: boolean;
  isPendingEdit: boolean;
  canChoosePublicationOnCreate: boolean;
  createPublicationStatus: 'draft' | 'published';
  setCreatePublicationStatus: (v: 'draft' | 'published') => void;
  isServerDraftEdit: boolean;
  showCollaboratorPublishOnEdit: boolean;
  publishForFollowersOnSave: boolean;
  setPublishForFollowersOnSave: (v: boolean) => void;
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
  handleLocationToggle,
  handleSubmit,
  handleDiscard,
  isPending,
  savedOffline,
  createMutationError,
  updateMutationError,
  isServerEdit,
  isPendingEdit,
  canChoosePublicationOnCreate,
  createPublicationStatus,
  setCreatePublicationStatus,
  isServerDraftEdit,
  showCollaboratorPublishOnEdit,
  publishForFollowersOnSave,
  setPublishForFollowersOnSave,
}: CreateEntryFormProps) {
  const { t } = useTranslation();
  const hasImages = images.length > 0 || localPreviews.length > 0;
  const isOnlineCreate = !isServerEdit && !isPendingEdit;
  const showVisibilityRow =
    isOnlineCreate && canChoosePublicationOnCreate && navigator.onLine !== false;

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
        <div className="flex-1">
          <label className="flex items-center gap-2 cursor-pointer" htmlFor="location-toggle">
            <p className="font-ui text-xs text-caption uppercase tracking-wide">{t('entries.locationToggle')}</p>
            <input
              id="location-toggle"
              type="checkbox"
              checked={form.locationEnabled}
              onChange={handleLocationToggle}
              className="w-4 h-4 accent-accent"
            />
          </label>
          {form.locationEnabled && (
            <div className="mt-2 space-y-1">
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
      </div>

      {/* Footer */}
      <div className="px-4 py-4 mt-auto space-y-3">
        {showVisibilityRow && (
          <fieldset className="space-y-2 border border-caption/15 rounded-round-eight p-3">
            <legend className="font-ui text-xs text-caption uppercase tracking-wide px-1">
              {t('entries.visibilityLegend')}
            </legend>
            <div className="flex items-start gap-2">
              <input
                id="entry-visibility-draft"
                data-testid="entry-visibility-draft"
                type="radio"
                name="entry-visibility"
                className="mt-0.5 accent-accent shrink-0"
                checked={createPublicationStatus === 'draft'}
                onChange={() => setCreatePublicationStatus('draft')}
              />
              <label htmlFor="entry-visibility-draft" className="cursor-pointer min-w-0">
                <span className="font-ui text-sm text-body block">{t('entries.saveAsDraft')}</span>
                <span className="font-ui text-xs text-caption">{t('entries.saveAsDraftHint')}</span>
              </label>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="entry-visibility-published"
                type="radio"
                name="entry-visibility"
                className="mt-0.5 accent-accent shrink-0"
                checked={createPublicationStatus === 'published'}
                onChange={() => setCreatePublicationStatus('published')}
              />
              <label htmlFor="entry-visibility-published" className="cursor-pointer min-w-0">
                <span className="font-ui text-sm text-body block">{t('entries.publishNow')}</span>
                <span className="font-ui text-xs text-caption">{t('entries.publishNowHint')}</span>
              </label>
            </div>
          </fieldset>
        )}
        {isOnlineCreate && canChoosePublicationOnCreate && navigator.onLine === false && (
          <p className="font-ui text-xs text-caption text-center">{t('entries.visibilityOfflineNote')}</p>
        )}
        {isServerDraftEdit && showCollaboratorPublishOnEdit && (
          <div className="flex items-start gap-2 px-1">
            <input
              id="entry-publish-followers"
              data-testid="entry-publish-followers-checkbox"
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-accent shrink-0"
              checked={publishForFollowersOnSave}
              onChange={(e) => setPublishForFollowersOnSave(e.target.checked)}
            />
            <label htmlFor="entry-publish-followers" className="cursor-pointer min-w-0">
              <span className="font-ui text-sm text-body block">
                {t('entries.publishForFollowersOnSave')}
              </span>
              <span className="font-ui text-xs text-caption">{t('entries.publishForFollowersHint')}</span>
            </label>
          </div>
        )}
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
        <PillButton type="submit" fullWidth disabled={isPending} data-testid="entry-save-submit">
          {isServerDraftEdit
            ? publishForFollowersOnSave
              ? t('entries.saveAndPublish')
              : t('entries.saveDraft')
            : isOnlineCreate && createPublicationStatus === 'draft'
              ? t('entries.saveDraft')
              : t('entries.saveEntry')}
        </PillButton>
      </div>
    </form>
  );
}
