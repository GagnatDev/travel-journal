import { useEffect } from 'react';

/** Default viewport: blocks iOS auto-zoom on input focus. */
export const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1.0, maximum-scale=1.0';

/** Relaxed viewport while a fullscreen image viewer is open. */
export const VIEWPORT_PINCH_ZOOM = 'width=device-width, initial-scale=1.0, maximum-scale=5.0';

let pinchZoomDepth = 0;
let savedViewportContent: string | null = null;

function getViewportMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="viewport"]');
}

function enablePinchZoom(meta: HTMLMetaElement): void {
  if (pinchZoomDepth === 0) {
    savedViewportContent = meta.getAttribute('content');
    meta.setAttribute('content', VIEWPORT_PINCH_ZOOM);
  }
  pinchZoomDepth++;
}

function disablePinchZoom(meta: HTMLMetaElement): void {
  if (pinchZoomDepth === 0) return;

  pinchZoomDepth--;
  if (pinchZoomDepth === 0) {
    meta.setAttribute('content', savedViewportContent ?? VIEWPORT_LOCKED);
    savedViewportContent = null;
  }
}

/** Temporarily allow pinch zoom while a fullscreen image viewer is open. */
export function useViewportPinchZoom(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const meta = getViewportMeta();
    if (!meta) return;

    enablePinchZoom(meta);
    return () => {
      disablePinchZoom(meta);
    };
  }, [enabled]);
}

/** Test-only reset for module-level pinch zoom state. */
export function resetViewportPinchZoomStateForTests(): void {
  pinchZoomDepth = 0;
  savedViewportContent = null;
}
