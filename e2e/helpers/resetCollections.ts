import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_STATE_PATH = join(process.cwd(), '.e2e', 'runtime-state.json');

type E2ERuntimeState = {
  mongodbUri?: string;
};

function resolveMongoUri(): string {
  if (process.env['MONGODB_URI']) {
    return process.env['MONGODB_URI'];
  }

  try {
    const content = readFileSync(RUNTIME_STATE_PATH, 'utf8');
    const runtimeState = JSON.parse(content) as E2ERuntimeState;
    if (runtimeState.mongodbUri) {
      return runtimeState.mongodbUri;
    }
  } catch {
    // Fall back to legacy default when runtime state is unavailable.
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
