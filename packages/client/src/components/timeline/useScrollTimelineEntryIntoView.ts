import { useEffect, useRef } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

const MAX_FRAMES = 120;
const SETTLE_FRAMES = 3;
const HIGHLIGHT_MS = 2000;

function flashHighlight(el: HTMLElement): void {
  el.classList.add('timeline-entry-highlight');
  window.setTimeout(() => el.classList.remove('timeline-entry-highlight'), HIGHLIGHT_MS);
}

/**
 * Scrolls the timeline to the entry wrapper carrying `data-entry-id` and
 * flashes the highlight style, then reports completion via `onScrolledToEntry`.
 *
 * Virtualized rows only exist in the DOM while the window is scrolled near
 * them, and their offsets are estimates until each row has been measured. So
 * a single `scrollToIndex` (or `querySelector` + `scrollIntoView`) can land
 * off-target or find no element at all. Instead this drives the virtualizer
 * toward the row's estimated offset each frame until the element exists, then
 * fine-tunes against the real element until its position holds still for a
 * few consecutive frames.
 */
export function useScrollTimelineEntryIntoView(
  entryId: string | null,
  entryIndex: number,
  virtualizer: Virtualizer<Window, Element> | null,
  onScrolledToEntry?: (() => void) | undefined,
): void {
  const onScrolledRef = useRef(onScrolledToEntry);
  onScrolledRef.current = onScrolledToEntry;

  useEffect(() => {
    if (!entryId || entryIndex < 0) return;

    const selector = `[data-entry-id="${CSS.escape(entryId)}"]`;

    const finish = (el: HTMLElement | null): void => {
      if (el) flashHighlight(el);
      onScrolledRef.current?.();
    };

    if (!virtualizer) {
      const el = document.querySelector<HTMLElement>(selector);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      finish(el);
      return;
    }

    let frameHandle = 0;
    let frames = 0;
    let stableFrames = 0;
    let lastTop: number | null = null;

    const step = (): void => {
      frames += 1;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) {
        stableFrames = 0;
        lastTop = null;
        virtualizer.scrollToIndex(entryIndex, { align: 'start' });
      } else {
        const top = el.getBoundingClientRect().top;
        if (lastTop !== null && Math.abs(top - lastTop) < 1) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
          el.scrollIntoView({ block: 'start' });
        }
        lastTop = top;
        if (stableFrames >= SETTLE_FRAMES) {
          finish(el);
          return;
        }
      }
      if (frames >= MAX_FRAMES) {
        finish(el);
        return;
      }
      frameHandle = requestAnimationFrame(step);
    };

    frameHandle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameHandle);
  }, [entryId, entryIndex, virtualizer]);
}
