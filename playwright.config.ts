import { defineConfig, devices } from '@playwright/test';

const e2eServerPort = process.env['SERVER_PORT'] ?? '3101';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  webServer: {
    // Client only: global-setup already runs the API on SERVER_PORT with the e2e MongoDB.
    command: 'pnpm --filter @travel-journal/client dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    env: {
      E2E_DISABLE_RATE_LIMIT: '1',
      E2E_API_ORIGIN: `http://localhost:${e2eServerPort}`,
    },
  },
});
