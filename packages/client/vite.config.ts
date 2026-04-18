import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Set `ANALYZE=1` for `pnpm build` / `build:analyze` to emit `dist/stats.html` (treemap). */
const analyze = process.env['ANALYZE'] === '1';

/** Dev server API target. Playwright sets E2E_API_ORIGIN so the client proxies to the e2e global-setup server. */
const apiProxyTarget = process.env['E2E_API_ORIGIN'] ?? 'http://localhost:3100';

const e2eEnvDir =
  process.env['TRAVEL_JOURNAL_E2E'] === '1' ? path.resolve(__dirname, 'e2e-env') : undefined;

/** Split heavy libs so precache stays under per-file limits; align with `injectManifest.maximumFileSizeToCacheInBytes`. */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('mapbox-gl')) return 'mapbox-gl';
  if (id.includes('date-fns')) return 'date-fns';
  return undefined;
}

export default defineConfig({
  envDir: e2eEnvDir,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['*.png', '*.webmanifest'],
      // Reuse the existing manifest.webmanifest in public/
      manifest: false,
      injectManifest: {
        // Default Workbox cap is 2 MiB; the main bundle (e.g. Mapbox) is larger — precache it explicitly.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,woff2}'],
      },
    }),
    ...(analyze
      ? [
          visualizer({
            filename: path.resolve(__dirname, 'dist/stats.html'),
            gzipSize: true,
            brotliSize: true,
            open: false,
            template: 'treemap',
          }),
        ]
      : []),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
