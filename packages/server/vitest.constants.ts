import os from 'node:os';
import path from 'node:path';

/** Written by globalSetup; read in setupFiles (Vitest does not propagate env from globalSetup). */
export const vitestMongoUriFile = path.join(
  os.tmpdir(),
  'travel-journal-vitest-mongodb-uri',
);
