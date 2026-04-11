import { unlink, writeFile } from 'node:fs/promises';

import { MongoMemoryServer } from 'mongodb-memory-server';

import { vitestMongoUriFile } from './vitest.constants.js';

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (process.env['MONGODB_URI']) {
    return async () => {};
  }

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await writeFile(vitestMongoUriFile, uri, 'utf8');

  return async () => {
    await mongod.stop();
    await unlink(vitestMongoUriFile).catch(() => {});
  };
}
