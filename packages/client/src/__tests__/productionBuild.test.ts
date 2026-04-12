// @vitest-environment node
// Vite/esbuild need Node's TextEncoder; jsdom breaks esbuild's invariant check.

import { readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** When the largest emitted `.js` exceeds this, split chunks or raise alongside `workbox.maximumFileSizeToCacheInBytes`. */
const MAX_LARGEST_JS_BYTES = 4 * 1024 * 1024;

describe('production build (PWA / Workbox)', () => {
  it(
    'completes without Workbox precache errors and stays within the JS size budget',
    async () => {
      await expect(
        build({
          root: clientRoot,
          mode: 'production',
          logLevel: 'error',
        }),
      ).resolves.toBeDefined();

      const assetsDir = join(clientRoot, 'dist', 'assets');
      const names = await readdir(assetsDir);
      const jsFiles = names.filter((n) => n.endsWith('.js'));
      let maxSize = 0;
      for (const name of jsFiles) {
        const s = await stat(join(assetsDir, name));
        if (s.size > maxSize) maxSize = s.size;
      }
      expect(maxSize).toBeGreaterThan(0);
      expect(
        maxSize,
        `largest JS (${maxSize} B) exceeds budget ${MAX_LARGEST_JS_BYTES} B`,
      ).toBeLessThanOrEqual(MAX_LARGEST_JS_BYTES);
    },
    180_000,
  );
});
