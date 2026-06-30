/**
 * Tiny global flag for "the user has unsaved work right now". Forms (e.g. the
 * trip-entry composer) report their dirty state here so app-wide actions — like
 * applying a pending PWA update, which reloads the page — can warn before
 * discarding work. Intentionally framework-free so any module can read it.
 */
let unsavedChanges = false;

export function setUnsavedChanges(value: boolean): void {
  unsavedChanges = value;
}

export function hasUnsavedChanges(): boolean {
  return unsavedChanges;
}
