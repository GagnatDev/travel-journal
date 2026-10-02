import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Owns the service-worker update lifecycle for the PWA.
 *
 * With `registerType: 'prompt'` (vite.config.ts) a new build installs but waits
 * to activate. We surface that as `updateAvailable` and expose `applyUpdate()`,
 * which activates the waiting worker and reloads — driven by an explicit user
 * action so an in-progress trip entry is never interrupted.
 *
 * A periodic + on-focus `registration.update()` makes installed PWAs notice a
 * new deploy without the cold-restart dance that `autoUpdate` required.
 */

/** How often to poll for a new service worker while the app is open. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let updateAvailable = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setUpdateAvailable(value: boolean): void {
  if (updateAvailable === value) return;
  updateAvailable = value;
  emit();
}

let initialized = false;

/** Register the service worker and wire update detection. Call once at startup. */
export function initPwaUpdate(): void {
  if (initialized) return;
  initialized = true;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setUpdateAvailable(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        void registration.update();
      };

      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

      // Returning to the app (tab focus / PWA resume) is the most common moment
      // a fresh deploy exists — check then too, so the prompt appears promptly.
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return updateAvailable;
}

/** Activate the waiting worker and reload to the new version. */
export function applyUpdate(): void {
  void updateSW?.(true);
}

/** React hook exposing whether an update is waiting, plus the apply action. */
export function usePwaUpdate(): { updateAvailable: boolean; applyUpdate: () => void } {
  const available = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { updateAvailable: available, applyUpdate };
}
