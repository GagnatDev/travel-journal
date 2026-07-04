import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Resets the window scroll position when navigating to another screen. All
 * screens share the window scroll, so without this a position from a long
 * page (e.g. the bottom of the timeline) carries over to the next screen.
 *
 * Only the pathname is watched: same-path search/state updates (like the
 * timeline clearing `?entryId` after the highlight scroll) must not yank the
 * user back to the top. POP navigations (back/forward) are left alone so the
 * browser's own scroll restoration can do its job.
 */
export function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP') return;
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}
