import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { installGracefulShutdown } from './http/gracefulShutdown.js';
import { listenApp } from './http/listenApp.js';
import { startDailyEntryDigestJob, stopDailyEntryDigestJob } from './jobs/entryDigestJob.js';
import { logger } from './logger.js';
import { initObjectStore } from './storage/index.js';

// Local dev uses packages/server/.env.local (gitignored). E2E and CI set env explicitly;
// skip .env.local under test so the API process is not mixed with dev-only variables.
const envLocalPath = join(__dirname, '..', '.env.local');
if (process.env['NODE_ENV'] !== 'test' && existsSync(envLocalPath)) {
  (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(
    envLocalPath,
  );
}

const PORT = parseInt(process.env['PORT'] ?? '8084', 10);
const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27019/travel-journal';

async function main() {
  // Fail fast on a misconfigured STORAGE_MODE / bucket env before taking traffic.
  initObjectStore();
  await connectDb(MONGODB_URI);

  const app = createApp();

  startDailyEntryDigestJob();

  const server = listenApp(
    app,
    PORT,
    () => {
      logger.info({ port: PORT }, 'Server listening');
    },
    (err) => {
      logger.error(err, 'Failed to start server');
      process.exit(1);
    },
  );

  installGracefulShutdown({
    server,
    cleanup: async () => {
      stopDailyEntryDigestJob();
      await disconnectDb();
    },
  });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
