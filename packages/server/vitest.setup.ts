import { existsSync, readFileSync } from 'node:fs';

import { vitestMongoUriFile } from './vitest.constants.js';

function mongoUriWithDatabase(baseUri: string, database: string): string {
  const u = new URL(baseUri);
  u.pathname = `/${database}`;
  return u.href;
}

if (!process.env['MONGODB_URI']) {
  if (!existsSync(vitestMongoUriFile)) {
    throw new Error(
      'MONGODB_URI is unset and embedded Mongo URI file is missing. Ensure Vitest globalSetup ran.',
    );
  }
  const base = readFileSync(vitestMongoUriFile, 'utf8').trim();
  const workerId = process.env['VITEST_WORKER_ID'] ?? '0';
  process.env['MONGODB_URI'] = mongoUriWithDatabase(base, `tj-vitest-w${workerId}`);
}
