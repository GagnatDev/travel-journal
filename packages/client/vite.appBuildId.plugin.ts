import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Plugin } from 'vite';

/**
 * Injects `import.meta.env.VITE_APP_BUILD_ID` and emits `dist/version.json`
 * with the same id so open clients can detect a new deployment (PWA reload).
 */
export function appBuildIdPlugin(isServe: boolean): Plugin {
  const buildId = isServe
    ? 'dev'
    : process.env['TRAVEL_JOURNAL_BUILD_ID']?.trim() || randomBytes(8).toString('hex');

  const versionBody = `${JSON.stringify({ buildId })}\n`;

  return {
    name: 'travel-journal-app-build-id',
    config() {
      return {
        define: {
          'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId),
        },
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split('?')[0];
        if (pathOnly === '/version.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(versionBody);
          return;
        }
        next();
      });
    },
    async writeBundle(outputOptions) {
      const outDir = outputOptions.dir;
      if (!outDir) return;
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'version.json'), versionBody, 'utf8');
    },
  };
}
