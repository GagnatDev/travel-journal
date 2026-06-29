/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time via Vite `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
