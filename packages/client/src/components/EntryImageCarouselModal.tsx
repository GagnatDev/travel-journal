import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  createMediaCacheKey,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';

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
  const { accessToken } = useAuth();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const prefetchedCacheKeysRef = useRef<Set<string>>(new Set());
  /** Horizontal start for a one-finger swipe; null when not tracking. */
  const swipeStartXRef = useRef<number | null>(null);
  /** True once this gesture used two+ touches (e.g. pinch-zoom); swipe is ignored until all touches end. */
  const skipSwipeForGestureRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(initialIndex);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen || !accessToken || images.length === 0) return;

    const neighborIndexes = [
      (activeIndex - 1 + images.length) % images.length,
      (activeIndex + 1) % images.length,
    ];

    for (const index of neighborIndexes) {
      const mediaKey = images[index]?.key;
      if (!mediaKey) continue;

      const cacheKey = createMediaCacheKey(accessToken, mediaKey);
      if (prefetchedCacheKeysRef.current.has(cacheKey)) continue;

      prefetchedCacheKeysRef.current.add(cacheKey);
      void acquireAuthenticatedMediaObjectUrl(mediaKey, accessToken).catch(() => {
        prefetchedCacheKeysRef.current.delete(cacheKey);
      });
    }
  }, [activeIndex, accessToken, images, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    for (const cacheKey of prefetchedCacheKeysRef.current) {
      releaseAuthenticatedMediaObjectUrl(cacheKey);
    }
    prefetchedCacheKeysRef.current.clear();
  }, [isOpen]);

  useEffect(
    () => () => {
      for (const cacheKey of prefetchedCacheKeysRef.current) {
        releaseAuthenticatedMediaObjectUrl(cacheKey);
      }
      prefetchedCacheKeysRef.current.clear();
    },
    [],
  );

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
    if (event.touches.length >= 2) {
      skipSwipeForGestureRef.current = true;
      swipeStartXRef.current = null;
      return;
    }
    if (skipSwipeForGestureRef.current) return;
    const firstTouch = event.touches[0] ?? event.changedTouches[0];
    swipeStartXRef.current = firstTouch?.clientX ?? null;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      skipSwipeForGestureRef.current = true;
      swipeStartXRef.current = null;
    }
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length > 0) {
      if (skipSwipeForGestureRef.current) {
        swipeStartXRef.current = null;
      }
      return;
    }

    const startX = swipeStartXRef.current;
    const skipSwipe = skipSwipeForGestureRef.current;
    skipSwipeForGestureRef.current = false;
    swipeStartXRef.current = null;

    if (skipSwipe) return;

    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;

    const delta = endX - startX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;

    if (delta < 0) {
      goNext();
    } else {
      goPrevious();
    }
  };

  const onTouchCancel = () => {
    skipSwipeForGestureRef.current = false;
    swipeStartXRef.current = null;
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
        className="relative z-10 flex h-full w-full touch-pan-x touch-pinch-zoom items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
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
