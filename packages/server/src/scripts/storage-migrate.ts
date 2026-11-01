/**
 * Copy every object from the legacy bucket (LEGACY_S3_*) to the homectl bucket (S3_*).
 * Idempotent; see docs/storage.md for when and how to run it.
 *
 *   node packages/server/dist/scripts/storage-migrate.js [--dry-run] [--prefix=media/] [--concurrency=4]
 *   pnpm --filter @travel-journal/server storage:migrate -- --dry-run
 *
 * Exit code 1 if any object failed to copy, 2 on bad config or arguments.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../logger.js';
import { readBackendConfig, StorageConfigError } from '../storage/config.js';
import { copyAllObjects } from '../storage/migrate.js';
import { S3ObjectStore } from '../storage/s3ObjectStore.js';

interface Args {
  dryRun: boolean;
  prefix?: string;
  concurrency?: number;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--prefix=')) args.prefix = arg.slice('--prefix='.length);
    else if (arg.startsWith('--concurrency=')) {
      const n = Number(arg.slice('--concurrency='.length));
      if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid --concurrency: ${arg}`);
      args.concurrency = n;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main(): Promise<number> {
  const envLocalPath = join(__dirname, '..', '..', '.env.local');
  if (existsSync(envLocalPath)) {
    (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(envLocalPath);
  }

  let args: Args;
  let source: S3ObjectStore;
  let target: S3ObjectStore;
  try {
    args = parseArgs(process.argv.slice(2));
    const legacy = readBackendConfig('legacy');
    const homectl = readBackendConfig('homectl');
    if (legacy.endpoint === homectl.endpoint && legacy.bucket === homectl.bucket) {
      throw new StorageConfigError('LEGACY_S3_* and S3_* point at the same bucket');
    }
    source = new S3ObjectStore('legacy', legacy);
    target = new S3ObjectStore('homectl', homectl);
    logger.info(
      { from: `${legacy.endpoint}/${legacy.bucket}`, to: `${homectl.endpoint}/${homectl.bucket}`, ...args },
      'Storage migration starting',
    );
  } catch (err: unknown) {
    logger.error({ err }, 'Storage migration not started');
    return 2;
  }

  const result = await copyAllObjects(source, target, {
    dryRun: args.dryRun,
    ...(args.prefix !== undefined && { prefix: args.prefix }),
    ...(args.concurrency !== undefined && { concurrency: args.concurrency }),
    onFailed: (key, err) => logger.warn({ key, err }, 'Storage migration: copy failed'),
  });
  logger.info({ result }, 'Storage migration finished');
  return result.failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      logger.error({ err }, 'Storage migration crashed');
      process.exit(1);
    },
  );
}
