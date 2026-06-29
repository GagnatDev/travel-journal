import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  resetViewportPinchZoomStateForTests,
  useViewportPinchZoom,
  VIEWPORT_LOCKED,
  VIEWPORT_PINCH_ZOOM,
} from '../hooks/useViewportPinchZoom.js';

function ensureViewportMeta(content = VIEWPORT_LOCKED): HTMLMetaElement {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
  return meta as HTMLMetaElement;
}

beforeEach(() => {
  resetViewportPinchZoomStateForTests();
  ensureViewportMeta();
});

afterEach(() => {
  resetViewportPinchZoomStateForTests();
});

describe('useViewportPinchZoom', () => {
  it('switches viewport to pinch-enabled when active', () => {
    const meta = ensureViewportMeta();

    renderHook(() => useViewportPinchZoom(true));

    expect(meta.getAttribute('content')).toBe(VIEWPORT_PINCH_ZOOM);
  });

  it('restores locked viewport when disabled', () => {
    const meta = ensureViewportMeta();

    const { rerender } = renderHook(({ enabled }) => useViewportPinchZoom(enabled), {
      initialProps: { enabled: true },
    });

    expect(meta.getAttribute('content')).toBe(VIEWPORT_PINCH_ZOOM);

    rerender({ enabled: false });

    expect(meta.getAttribute('content')).toBe(VIEWPORT_LOCKED);
  });

  it('restores locked viewport on unmount', () => {
    const meta = ensureViewportMeta();

    const { unmount } = renderHook(() => useViewportPinchZoom(true));
    expect(meta.getAttribute('content')).toBe(VIEWPORT_PINCH_ZOOM);

    unmount();

    expect(meta.getAttribute('content')).toBe(VIEWPORT_LOCKED);
  });

  it('keeps pinch viewport until the last nested viewer closes', () => {
    const meta = ensureViewportMeta();

    const first = renderHook(() => useViewportPinchZoom(true));
    const second = renderHook(() => useViewportPinchZoom(true));

    expect(meta.getAttribute('content')).toBe(VIEWPORT_PINCH_ZOOM);

    first.unmount();
    expect(meta.getAttribute('content')).toBe(VIEWPORT_PINCH_ZOOM);

    second.unmount();
    expect(meta.getAttribute('content')).toBe(VIEWPORT_LOCKED);
  });
});
