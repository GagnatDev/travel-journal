/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  /**
   * Interactive login URL owned by the auth layer, NOT by the SPA router.
   * Unset while auth is hand-rolled (the app routes to its own /login screen).
   * Set to `/auth/login` at homectl-auth sidecar cutover so session expiry
   * escalates to a full-page navigation that bypasses the service worker
   * (see src/auth/loginRedirect.ts).
   */
  readonly VITE_AUTH_LOGIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time via Vite `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
