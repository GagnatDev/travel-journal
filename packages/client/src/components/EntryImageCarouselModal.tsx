import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';
import { useViewportPinchZoom } from '../hooks/useViewportPinchZoom.js';
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
  /** Trip creator: photobook cover controls behind the settings menu. */
  photobookCoverAction?: {
    activeImageKey: string;
    isCurrentCover: boolean;
    onSetCover: (imageKey: string) => void;
    onClearCover: () => void;
    busy?: boolean;
  };
}

const SWIPE_THRESHOLD_PX = 40;
const AXIS_LOCK_THRESHOLD_PX = 12;
const DISMISS_THRESHOLD_MIN_PX = 80;
const DISMISS_THRESHOLD_VH = 0.18;
const DRAG_SNAP_MS = 200;
const BODY_OPEN_LOCK = 'entryCarouselOpen';

function getDismissThresholdPx(): number {
  return Math.max(DISMISS_THRESHOLD_MIN_PX, window.innerHeight * DISMISS_THRESHOLD_VH);
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function EntryImageCarouselModal({
  images,
  initialIndex,
  isOpen,
  onClose,
  photobookCoverAction,
}: EntryImageCarouselModalProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [photobookMenuOpen, setPhotobookMenuOpen] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragSnapping, setIsDragSnapping] = useState(false);
  const photobookMenuRef = useRef<HTMLDivElement>(null);
  const prefetchedCacheKeysRef = useRef<Set<string>>(new Set());
  /** Touch start for a one-finger swipe; null when not tracking. */
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const gestureAxisRef = useRef<'horizontal' | 'vertical' | null>(null);
  /** True once this gesture used two+ touches (e.g. pinch-zoom); swipe is ignored until all touches end. */
  const skipSwipeForGestureRef = useRef(false);

  useViewportPinchZoom(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(initialIndex);
    setPhotobookMenuOpen(false);
    setDragOffsetY(0);
    setIsDragSnapping(false);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen || !photobookMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const el = photobookMenuRef.current;
      if (!el || el.contains(event.target as Node)) return;
      setPhotobookMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isOpen, photobookMenuOpen]);

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
        if (photobookMenuOpen) {
          setPhotobookMenuOpen(false);
          event.stopPropagation();
          return;
        }
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
  }, [images.length, isOpen, onClose, photobookMenuOpen]);

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

  const togglePhotobookCover = () => {
    if (!photobookCoverAction) return;
    if (photobookCoverAction.isCurrentCover) {
      photobookCoverAction.onClearCover();
    } else {
      photobookCoverAction.onSetCover(photobookCoverAction.activeImageKey);
    }
  };

  const resetGestureTracking = () => {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    gestureAxisRef.current = null;
  };

  const snapDragBack = () => {
    setIsDragSnapping(true);
    setDragOffsetY(0);
    window.setTimeout(() => setIsDragSnapping(false), DRAG_SNAP_MS);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      skipSwipeForGestureRef.current = true;
      resetGestureTracking();
      setDragOffsetY(0);
      setIsDragSnapping(false);
      return;
    }
    if (skipSwipeForGestureRef.current) return;
    const firstTouch = event.touches[0] ?? event.changedTouches[0];
    swipeStartXRef.current = firstTouch?.clientX ?? null;
    swipeStartYRef.current = firstTouch?.clientY ?? null;
    gestureAxisRef.current = null;
    setIsDragSnapping(false);
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      skipSwipeForGestureRef.current = true;
      resetGestureTracking();
      setDragOffsetY(0);
      return;
    }
    if (skipSwipeForGestureRef.current) return;

    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    const currentTouch = event.touches[0];
    if (startX === null || startY === null || !currentTouch) return;

    const deltaX = currentTouch.clientX - startX;
    const deltaY = currentTouch.clientY - startY;

    if (gestureAxisRef.current === null) {
      const movement = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      if (movement < AXIS_LOCK_THRESHOLD_PX) return;

      if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
        gestureAxisRef.current = 'vertical';
      } else {
        gestureAxisRef.current = 'horizontal';
      }
    }

    if (gestureAxisRef.current === 'vertical' && deltaY > 0) {
      event.preventDefault();
      setDragOffsetY(deltaY);
    }
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length > 0) {
      if (skipSwipeForGestureRef.current) {
        resetGestureTracking();
      }
      return;
    }

    const axis = gestureAxisRef.current;
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    const skipSwipe = skipSwipeForGestureRef.current;
    skipSwipeForGestureRef.current = false;
    resetGestureTracking();

    if (skipSwipe) {
      setDragOffsetY(0);
      return;
    }

    if (axis === 'vertical') {
      const endY = event.changedTouches[0]?.clientY;
      const finalDragOffset =
        startY !== null && endY !== undefined ? Math.max(0, endY - startY) : dragOffsetY;
      const dismissThreshold = getDismissThresholdPx();
      if (finalDragOffset >= dismissThreshold) {
        onClose();
      } else if (finalDragOffset > 0) {
        snapDragBack();
      }
      return;
    }

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
    resetGestureTracking();
    if (dragOffsetY > 0) {
      snapDragBack();
    }
  };

  const dismissThreshold = getDismissThresholdPx();
  const backdropOpacity =
    dragOffsetY > 0 ? Math.max(0, 0.85 * (1 - dragOffsetY / dismissThreshold)) : 0.85;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t('entries.carousel.dialogLabel')}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/85"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      <div
        data-testid="entry-image-carousel-swipe-area"
        className="relative z-10 flex h-full w-full touch-none touch-pinch-zoom items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translateY(${dragOffsetY}px) scale(${1 - dragOffsetY * 0.0008})`,
            transition: isDragSnapping ? `transform ${DRAG_SNAP_MS}ms ease-out` : 'none',
          }}
        >
          <AuthenticatedImage
            mediaKey={activeImage.key}
            alt={activeImage.alt}
            loading="eager"
            className="h-full w-full object-contain select-none"
            draggable={false}
          />
        </div>

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

        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
          {photobookCoverAction ? (
            <div className="relative" ref={photobookMenuRef}>
              <button
                type="button"
                data-testid="entry-image-carousel-photobook-settings"
                aria-label={t('entries.carousel.photobookCoverMenuLabel')}
                aria-expanded={photobookMenuOpen}
                aria-haspopup="menu"
                disabled={photobookCoverAction.busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotobookMenuOpen((open) => !open);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-50"
              >
                <GearIcon />
              </button>
              {photobookMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 min-w-[14rem] rounded-lg border border-white/15 bg-neutral-900/95 py-1 shadow-lg backdrop-blur-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={photobookCoverAction.isCurrentCover}
                    disabled={photobookCoverAction.busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotobookCover();
                    }}
                    className="font-ui flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 disabled:opacity-50"
                  >
                    <span>{t('entries.carousel.photobookCoverToggleLabel')}</span>
                    <span
                      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                        photobookCoverAction.isCurrentCover ? 'bg-accent justify-end' : 'bg-white/25 justify-start'
                      }`}
                      aria-hidden
                    >
                      <span className="block h-5 w-5 rounded-full bg-white shadow" />
                    </span>
                  </button>
                  <p className="font-ui border-t border-white/10 px-3 py-2 text-xs text-white/70">
                    {photobookCoverAction.isCurrentCover
                      ? t('entries.carousel.photobookCoverMenuHintOn')
                      : t('entries.carousel.photobookCoverMenuHintOff')}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            aria-label={t('entries.carousel.closeImageCarousel')}
            onClick={onClose}
            className="rounded-full bg-black/60 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          {activeIndex + 1} / {images.length}
        </div>
      </div>
    </div>,
    document.body,
  );
}
