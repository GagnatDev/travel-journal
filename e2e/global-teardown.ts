import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import mongoose from 'mongoose';
import { StartedTestContainer } from 'testcontainers';

const RUNTIME_STATE_PATH = join(process.cwd(), '.e2e', 'runtime-state.json');

type E2ERuntimeState = {
  mongodbUri: string;
};

function getContainerFromGlobal(key: string): StartedTestContainer | null {
  const container = (globalThis as Record<string, unknown>)[key] as StartedTestContainer | undefined;
  return container ?? null;
}

export default async function globalTeardown() {
  const server = (globalThis as Record<string, unknown>).__e2eServerProcess as
    | { kill: (signal?: string) => void }
    | null
    | undefined;
  if (server) {
    server.kill('SIGTERM');
  }

  let runtimeState: E2ERuntimeState | null = null;
  try {
    const content = await readFile(RUNTIME_STATE_PATH, 'utf8');
    runtimeState = JSON.parse(content) as E2ERuntimeState;
  } catch {
    // best effort
  }

  const mongoContainer = getContainerFromGlobal('__e2eMongoContainer');
  const minioContainer = getContainerFromGlobal('__e2eMinioContainer');
  if (mongoContainer) {
    await mongoContainer.stop().catch(() => undefined);
  }
  if (minioContainer) {
    await minioContainer.stop().catch(() => undefined);
  }

  if (runtimeState?.mongodbUri) {
    try {
      await mongoose.connect(runtimeState.mongodbUri);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    } catch {
      // best effort
    }
  }

  await rm(RUNTIME_STATE_PATH, { force: true }).catch(() => undefined);
}
