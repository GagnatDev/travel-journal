import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Dev server API target. Playwright sets E2E_API_ORIGIN so the client proxies to the e2e global-setup server. */
const apiProxyTarget = process.env['E2E_API_ORIGIN'] ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['*.png', '*.webmanifest'],
      // Reuse the existing manifest.webmanifest in public/
      manifest: false,
      workbox: {
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
          // Media proxy — stale-while-revalidate (signed URLs expire)
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
