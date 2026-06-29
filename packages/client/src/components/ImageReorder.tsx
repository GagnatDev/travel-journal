import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntryImage } from '@travel-journal/shared';

import { AuthenticatedImage } from './AuthenticatedImage.js';
import { ChevronLeftIcon, ChevronRightIcon, GripIcon } from './icons/index.js';

interface ImageReorderProps {
  images: EntryImage[];
  onImagesChange: (images: EntryImage[]) => void;
  onFileSelect: (files: FileList) => void;
}

function reorderImages(images: EntryImage[], from: number, to: number): EntryImage[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
    return images;
  }
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next.map((img, i) => ({ ...img, order: i }));
}

export function ImageReorder({ images, onImagesChange, onFileSelect }: ImageReorderProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleDelete = (index: number) => {
    onImagesChange(
      images.filter((_, i) => i !== index).map((img, i) => ({ ...img, order: i })),
    );
  };

  const handleMove = (from: number, to: number) => {
    onImagesChange(reorderImages(images, from, to));
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
    setDraggingIndex(index);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
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
    onImagesChange(reorderImages(images, from, index));
    dragIndexRef.current = null;
    setDraggingIndex(null);
  };

  return (
    <div>
      {images.length > 1 && (
        <p className="font-ui text-xs text-caption mb-2">{t('entries.reorderHint')}</p>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-2">
          {images.map((img, index) => {
            const isDragging = draggingIndex === index;
            const isDropTarget = dragOverIndex === index && draggingIndex !== index;

            return (
              <div
                key={img.key}
                data-key={img.key}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(index)}
                className={`flex flex-col items-center gap-1 rounded transition-shadow ${
                  isDropTarget ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary' : ''
                } ${isDragging ? 'opacity-60' : ''}`}
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-1 left-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-primary/90 px-1 font-ui text-xs font-medium text-body shadow-sm"
                  >
                    {index + 1}
                  </span>
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
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={t('entries.moveImageLeft')}
                    data-testid={`move-image-left-${index}`}
                    className="flex h-7 w-7 items-center justify-center rounded text-caption transition-colors hover:text-body hover:bg-bg-primary/60 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ChevronLeftIcon width={16} height={16} aria-hidden="true" />
                  </button>
                  <div
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={t('entries.dragHandle')}
                    data-testid={`drag-handle-${index}`}
                    onDragStart={() => handleDragStart(index)}
                    onDragEnd={handleDragEnd}
                    className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-caption active:cursor-grabbing hover:text-body hover:bg-bg-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <GripIcon width={16} height={16} aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    disabled={index === images.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={t('entries.moveImageRight')}
                    data-testid={`move-image-right-${index}`}
                    className="flex h-7 w-7 items-center justify-center rounded text-caption transition-colors hover:text-body hover:bg-bg-primary/60 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ChevronRightIcon width={16} height={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
