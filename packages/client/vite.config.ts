import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * App version = short git commit hash. CI/Docker pass it via `VITE_GIT_SHA`
 * (the build image has no `.git`); locally we fall back to `git rev-parse`,
 * then to `'dev'`. Surfaced in the About screen and used for debugging.
 */
function resolveGitSha(): string {
  const fromEnv = process.env['VITE_GIT_SHA'];
  if (fromEnv && fromEnv.trim() !== '') return fromEnv.trim().slice(0, 12);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const appVersion = resolveGitSha();
const buildTime = new Date().toISOString();

/** Set `ANALYZE=1` for `pnpm build` / `build:analyze` to emit `dist/stats.html` (treemap). */
const analyze = process.env['ANALYZE'] === '1';

/** Dev server API target. Playwright sets E2E_API_ORIGIN so the client proxies to the e2e global-setup server. */
const apiProxyTarget = process.env['E2E_API_ORIGIN'] ?? 'http://localhost:3100';

const isE2E = process.env['TRAVEL_JOURNAL_E2E'] === '1';

const e2eEnvDir = isE2E ? path.resolve(__dirname, 'e2e-env') : undefined;

/** Split heavy libs so precache stays under per-file limits; align with `injectManifest.maximumFileSizeToCacheInBytes`. */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('mapbox-gl')) return 'mapbox-gl';
  if (id.includes('date-fns')) return 'date-fns';
  return undefined;
}

export default defineConfig({
  envDir: e2eEnvDir,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['*.png', '*.webmanifest'],
      // Reuse the existing manifest.webmanifest in public/
      manifest: false,
      // Without this, `navigator.serviceWorker.ready` never resolves in `pnpm dev`,
      // which in turn makes push-enabled features (e.g. per-trip notification mode)
      // hang silently when they call `ensurePushSubscription`.
      //
      // Disabled under Playwright (`TRAVEL_JOURNAL_E2E=1`): the Workbox runtime
      // routes intercept `/api/v1/trips/*` (NetworkFirst) which adds install /
      // activation latency to every new browser context and causes the multi-
      // context notification flows to flake under CI load. E2E does not
      // exercise push delivery, and `ensurePushSubscription` already fails
      // fast when the SW is absent, so tests don't need it.
      devOptions: {
        enabled: !isE2E,
        type: 'module',
        navigateFallback: 'index.html',
      },
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
