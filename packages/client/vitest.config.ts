import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // MSW server is module singleton; parallel test files share it and race on
    // server.use()/resetHandlers(). Forks isolate each file's handlers.
    pool: 'forks',
  },
});
