import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // vite-plugin-pwa only supplies this virtual module at build/dev time.
      'virtual:pwa-register': path.resolve(dirname, 'src/__tests__/stubs/pwaRegister.ts'),
    },
  },
  define: {
    // Mirrors the build-time globals from vite.config.ts so modules importing
    // them (lib/appVersion.ts) resolve under Vitest.
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_TIME__: JSON.stringify('1970-01-01T00:00:00.000Z'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // MSW server is module singleton; parallel test files share it and race on
    // server.use()/resetHandlers(). Forks isolate each file's handlers.
    pool: 'forks',
  },
});
