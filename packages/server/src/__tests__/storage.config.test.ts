import { describe, it, expect } from 'vitest';

import {
  describeStorageConfig,
  readBackendConfig,
  readStorageConfig,
  StorageConfigError,
} from '../storage/config.js';

const LEGACY = {
  LEGACY_S3_ENDPOINT: 'https://s3.legacy.example',
  LEGACY_S3_BUCKET: 'legacy-bucket',
  LEGACY_S3_ACCESS_KEY: 'legacy-ak',
  LEGACY_S3_SECRET_KEY: 'legacy-sk',
};

const HOMECTL = {
  S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
  S3_REGION: 'fr-par',
  S3_BUCKET: 'homectl-reisedagbok',
  S3_ACCESS_KEY: 'homectl-ak',
  S3_SECRET_KEY: 'homectl-sk',
};

describe('readStorageConfig', () => {
  it('without STORAGE_MODE keeps the pre-facade behaviour: one legacy bucket from S3_*', () => {
    const cfg = readStorageConfig({
      S3_ENDPOINT: 'https://s3.today.example',
      S3_BUCKET: 'today',
      S3_ACCESS_KEY: 'ak',
      S3_SECRET_KEY: 'sk',
    });
    expect(cfg).toEqual({
      mode: 'legacy',
      implicit: true,
      legacy: {
        endpoint: 'https://s3.today.example',
        bucket: 'today',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        region: 'us-east-1',
        forcePathStyle: true,
      },
    });
  });

  it('without any env falls back to the local MinIO defaults', () => {
    const cfg = readStorageConfig({});
    expect(cfg.legacy).toMatchObject({
      endpoint: 'http://localhost:9100',
      bucket: 'travel-journal',
      accessKeyId: 'minioadmin',
    });
  });

  it('legacy mode reads LEGACY_S3_* and ignores the Terraform S3_* keys', () => {
    const cfg = readStorageConfig({ STORAGE_MODE: 'legacy', ...LEGACY, ...HOMECTL });
    expect(cfg.mode).toBe('legacy');
    expect(cfg.implicit).toBe(false);
    expect(cfg.legacy?.bucket).toBe('legacy-bucket');
    expect(cfg.homectl).toBeUndefined();
  });

  it('legacy mode does not silently fall back to S3_* when LEGACY_S3_* is missing', () => {
    expect(() => readStorageConfig({ STORAGE_MODE: 'legacy', ...HOMECTL })).toThrow(
      /LEGACY_S3_ENDPOINT, LEGACY_S3_BUCKET, LEGACY_S3_ACCESS_KEY, LEGACY_S3_SECRET_KEY/,
    );
  });

  it('homectl mode reads the Terraform S3_* names including region', () => {
    const cfg = readStorageConfig({ STORAGE_MODE: 'homectl', ...HOMECTL });
    expect(cfg.homectl).toMatchObject({ bucket: 'homectl-reisedagbok', region: 'fr-par' });
    expect(cfg.legacy).toBeUndefined();
  });

  it('migrating mode needs both backends', () => {
    expect(() => readStorageConfig({ STORAGE_MODE: 'migrating', ...HOMECTL })).toThrow(StorageConfigError);
    expect(() => readStorageConfig({ STORAGE_MODE: 'migrating', ...LEGACY })).toThrow(StorageConfigError);
    const cfg = readStorageConfig({ STORAGE_MODE: 'migrating', ...LEGACY, ...HOMECTL });
    expect(cfg.legacy?.bucket).toBe('legacy-bucket');
    expect(cfg.homectl?.bucket).toBe('homectl-reisedagbok');
  });

  it('migrating mode rejects two configs pointing at the same bucket', () => {
    expect(() =>
      readStorageConfig({
        STORAGE_MODE: 'migrating',
        ...HOMECTL,
        LEGACY_S3_ENDPOINT: HOMECTL.S3_ENDPOINT,
        LEGACY_S3_BUCKET: HOMECTL.S3_BUCKET,
        LEGACY_S3_ACCESS_KEY: 'x',
        LEGACY_S3_SECRET_KEY: 'y',
      }),
    ).toThrow(/same one/);
  });

  it('rejects an unknown mode, case-insensitively accepts known ones', () => {
    expect(() => readStorageConfig({ STORAGE_MODE: 'cluster' })).toThrow(/Invalid STORAGE_MODE/);
    expect(readStorageConfig({ STORAGE_MODE: ' HOMECTL ', ...HOMECTL }).mode).toBe('homectl');
  });

  it('treats an empty STORAGE_MODE as unset', () => {
    expect(readStorageConfig({ STORAGE_MODE: '' }).implicit).toBe(true);
  });
});

describe('readBackendConfig', () => {
  it('parses FORCE_PATH_STYLE, defaulting to true', () => {
    expect(readBackendConfig('homectl', HOMECTL).forcePathStyle).toBe(true);
    expect(readBackendConfig('homectl', { ...HOMECTL, S3_FORCE_PATH_STYLE: 'false' }).forcePathStyle).toBe(false);
    expect(
      readBackendConfig('legacy', { ...LEGACY, LEGACY_S3_FORCE_PATH_STYLE: '1' }).forcePathStyle,
    ).toBe(true);
  });
});

describe('describeStorageConfig', () => {
  it('never includes credentials', () => {
    const cfg = readStorageConfig({ STORAGE_MODE: 'migrating', ...LEGACY, ...HOMECTL });
    const text = JSON.stringify(describeStorageConfig(cfg));
    expect(text).toContain('homectl-reisedagbok');
    expect(text).toContain('legacy-bucket');
    for (const secret of ['legacy-ak', 'legacy-sk', 'homectl-ak', 'homectl-sk']) {
      expect(text).not.toContain(secret);
    }
  });
});
