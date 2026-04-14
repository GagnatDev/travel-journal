import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_STATE_PATH = join(process.cwd(), '.e2e', 'runtime-state.json');

type E2ERuntimeState = {
  mongodbUri?: string;
};

function resolveMongoUri(): string {
  // Prefer the URI global-setup wrote: the API server always uses that database.
  // A shell-level MONGODB_URI (e.g. for day-to-day dev) must not override it, or
  // resets hit the wrong DB while tests talk to the isolated e2e server (CI is fine
  // because e2e:ci sets MONGODB_URI to the same DB the server uses).
  try {
    const content = readFileSync(RUNTIME_STATE_PATH, 'utf8');
    const runtimeState = JSON.parse(content) as E2ERuntimeState;
    if (runtimeState.mongodbUri) {
      return runtimeState.mongodbUri;
    }
  } catch {
    // Fall back when global-setup has not run or the file is missing.
  }

  if (process.env['MONGODB_URI']) {
    return process.env['MONGODB_URI'];
  }

  return 'mongodb://localhost:27017/travel-journal-test';
}

export async function resetCollections(...names: string[]): Promise<void> {
  const mongodbUri = resolveMongoUri();
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongodbUri);
  }

  await Promise.all(
    names.map((name) =>
      mongoose.connection.collection(name).deleteMany({}),
    ),
  );
}
