import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dev server API target. Playwright sets E2E_API_ORIGIN so the client proxies to the e2e global-setup server. */
const apiProxyTarget = process.env['E2E_API_ORIGIN'] ?? 'http://localhost:3100';

const e2eEnvDir =
  process.env['TRAVEL_JOURNAL_E2E'] === '1' ? path.resolve(__dirname, 'e2e-env') : undefined;

export default defineConfig({
  envDir: e2eEnvDir,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['*.png', '*.webmanifest'],
      // Reuse the existing manifest.webmanifest in public/
      manifest: false,
      workbox: {
        // Default Workbox cap is 2 MiB; the main bundle (e.g. Mapbox) is larger — precache it explicitly.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,woff2}'],
        runtimeCaching: [
          // i18n locale files — cache-first (rarely change)
          {
            urlPattern: /^\/locales\//,
            handler: 'CacheFirst',
            options: { cacheName: 'locales' },
          },
          // API trip/entry data — network-first with cache fallback
          {
            urlPattern: /^\/api\/v1\/trips/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-trips' },
          },
          // Media proxy — stale-while-revalidate (object bytes streamed from API)
          {
            urlPattern: /^\/api\/v1\/media\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'media' },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
