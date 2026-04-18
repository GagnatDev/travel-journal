import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createApp } from './app.js';
import { connectDb } from './db.js';
import { startDailyEntryDigestJob } from './jobs/entryDigestJob.js';
import { logger } from './logger.js';

// Local dev uses packages/server/.env.local (gitignored). E2E and CI set env explicitly;
// skip .env.local under test so the API process is not mixed with dev-only variables.
const envLocalPath = join(__dirname, '..', '.env.local');
if (process.env['NODE_ENV'] !== 'test' && existsSync(envLocalPath)) {
  (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(
    envLocalPath,
  );
}

const PORT = parseInt(process.env['PORT'] ?? '3100', 10);
const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal';

async function main() {
  await connectDb(MONGODB_URI);

  const app = createApp();

  startDailyEntryDigestJob();

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server listening');
  });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
