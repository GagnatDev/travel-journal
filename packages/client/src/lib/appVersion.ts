/**
 * Build-time app version metadata, injected via Vite `define` (vite.config.ts).
 * `APP_VERSION` is the short git commit hash (or `'dev'` for local builds with
 * no SHA available). Import from here rather than referencing the raw globals.
 */
export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_TIME: string = __BUILD_TIME__;
