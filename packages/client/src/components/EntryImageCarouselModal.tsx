import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { AuthenticatedImage } from './AuthenticatedImage.js';

interface EntryImageCarouselModalProps {
  images: Array<{ key: string; alt: string }>;
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const SWIPE_THRESHOLD_PX = 40;
const BODY_OPEN_LOCK = 'entryCarouselOpen';

export function EntryImageCarouselModal({
  images,
  initialIndex,
  isOpen,
  onClose,
}: EntryImageCarouselModalProps) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(initialIndex);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => (current - 1 + images.length) % images.length);
      } else if (event.key === 'ArrowRight') {
        setActiveIndex((current) => (current + 1) % images.length);
      }
    };

    document.body.style.overflow = 'hidden';
    document.body.dataset[BODY_OPEN_LOCK] = 'true';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset[BODY_OPEN_LOCK];
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [images.length, isOpen, onClose]);

  if (!isOpen || images.length === 0) {
    return null;
  }

  const activeImage = images[activeIndex];
  if (!activeImage) return null;

  const goPrevious = () => {
    setActiveIndex((current) => (current - 1 + images.length) % images.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % images.length);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX;
    const endX = event.changedTouches[0]?.clientX;
    setTouchStartX(null);
    if (startX === null || endX === undefined) return;

    const delta = endX - startX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;

    if (delta < 0) {
      goNext();
    } else {
      goPrevious();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t('entries.carousel.dialogLabel')}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/85" onClick={onClose} />

      <div
        data-testid="entry-image-carousel-swipe-area"
        className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AuthenticatedImage
          mediaKey={activeImage.key}
          alt={activeImage.alt}
          loading="eager"
          className="h-full w-full object-contain select-none"
          draggable={false}
        />

        <button
          type="button"
          aria-label={t('entries.carousel.previousImage')}
          onClick={goPrevious}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white transition hover:bg-black/70"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          aria-label={t('entries.carousel.nextImage')}
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white transition hover:bg-black/70"
        >
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          aria-label={t('entries.carousel.closeImageCarousel')}
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black/80 sm:right-4 sm:top-4"
        >
          {t('common.close')}
        </button>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          {activeIndex + 1} / {images.length}
        </div>
      </div>
    </div>,
    document.body,
  );
}
