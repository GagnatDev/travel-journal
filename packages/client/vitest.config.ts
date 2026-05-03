import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify('vitest-client-bundle'),
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
