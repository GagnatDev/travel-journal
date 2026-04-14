import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

import { defineConfig, devices } from '@playwright/test';

// Playwright loads this config from the repo root; avoid import.meta (breaks TS transform in some versions).
const e2eEnvPath = resolve(process.cwd(), '.env.e2e');
if (existsSync(e2eEnvPath)) {
  const parsed = parseEnv(readFileSync(e2eEnvPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const e2eServerPort = process.env['SERVER_PORT'] ?? '3101';
const e2eClientPort = process.env['E2E_VITE_PORT'] ?? '5173';
const clientOrigin = `http://localhost:${e2eClientPort}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: clientOrigin,
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
    command: `pnpm --filter @travel-journal/client exec vite --port ${e2eClientPort}`,
    url: clientOrigin,
    reuseExistingServer: process.env['E2E_REUSE_EXISTING_SERVER'] === '1',
    timeout: 60_000,
    env: {
      E2E_DISABLE_RATE_LIMIT: '1',
      E2E_API_ORIGIN: `http://localhost:${e2eServerPort}`,
      TRAVEL_JOURNAL_E2E: '1',
    },
  },
});
