import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntryImage } from '@travel-journal/shared';

import { AuthenticatedImage } from './AuthenticatedImage.js';

interface ImageReorderProps {
  images: EntryImage[];
  onImagesChange: (images: EntryImage[]) => void;
  onFileSelect: (files: FileList) => void;
  isUploading?: boolean;
}

export function ImageReorder({ images, onImagesChange, onFileSelect, isUploading }: ImageReorderProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDelete = (index: number) => {
    onImagesChange(
      images.filter((_, i) => i !== index).map((img, i) => ({ ...img, order: i })),
    );
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDragLeave = () => setDragOverIndex(null);
  const handleDrop = (index: number) => {
    setDragOverIndex(null);
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved!);
    onImagesChange(next.map((img, i) => ({ ...img, order: i })));
    dragIndexRef.current = null;
  };

  return (
    <div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, index) => (
            <div
              key={img.key}
              data-key={img.key}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(index)}
              className={`relative ${dragOverIndex === index ? 'opacity-50' : ''}`}
            >
              <AuthenticatedImage
                mediaKey={img.thumbnailKey ?? img.key}
                alt=""
                loading="lazy"
                className="h-20 w-20 object-cover rounded"
              />
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                aria-label={t('entries.removeImage')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {isUploading && (
        <p className="font-ui text-xs text-caption mb-2">{t('entries.uploadingImage')}</p>
      )}
      {images.length < 10 && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-bg-secondary border border-caption/30 rounded-round-eight font-ui text-sm text-body hover:border-accent/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            {t('entries.addPhotos')}
          </button>
          <input
            id="entry-media-input"
            ref={fileInputRef}
            data-testid="entry-media-file-input"
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.length) {
                onFileSelect(e.target.files);
                e.target.value = '';
              }
            }}
            className="sr-only"
          />
        </>
      )}
    </div>
  );
}
