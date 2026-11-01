import { logger } from '../logger.js';
import { describeStorageConfig, readStorageConfig, type StorageConfig } from './config.js';
import type { ObjectStore } from './objectStore.js';
import { RoutedObjectStore } from './routedObjectStore.js';
import { S3ObjectStore } from './s3ObjectStore.js';

export type { ObjectStore, StoredObject, ObjectHead, ObjectListing } from './objectStore.js';
export type { StorageMode } from './routedObjectStore.js';
export { StorageConfigError, readStorageConfig, describeStorageConfig } from './config.js';

export function createObjectStore(config: StorageConfig): RoutedObjectStore {
  return new RoutedObjectStore(
    config.mode,
    {
      ...(config.legacy && { legacy: new S3ObjectStore('legacy', config.legacy) }),
      ...(config.homectl && { homectl: new S3ObjectStore('homectl', config.homectl) }),
    },
    (op, key) => {
      // Should drop to zero once storage:migrate has copied everything (docs/storage.md).
      logger.info({ op, key }, 'Storage read fell back to legacy bucket');
    },
  );
}

let store: RoutedObjectStore | undefined;

/** The process-wide object store, built from env on first use. */
export function getObjectStore(): ObjectStore {
  store ??= createObjectStore(readStorageConfig());
  return store;
}

/**
 * Validate storage config and build the store at boot, so a misconfigured deploy fails
 * fast instead of on the first upload. Throws {@link StorageConfigError}.
 */
export function initObjectStore(): ObjectStore {
  const config = readStorageConfig();
  store = createObjectStore(config);
  logger.info({ storage: describeStorageConfig(config) }, 'Object storage configured');
  return store;
}

/** Test hook: forget the cached store so the next call re-reads env. */
export function resetObjectStoreForTests(): void {
  store = undefined;
}
