import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    /** Embedded MongoDB + bcrypt-heavy tests can spike under default parallelism on CI. */
    testTimeout: 15_000,
  },
});
