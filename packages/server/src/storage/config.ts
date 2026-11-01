import { STORAGE_MODES, type StorageMode } from './routedObjectStore.js';
import type { S3BackendConfig } from './s3ObjectStore.js';

type Env = Record<string, string | undefined>;

export type BackendName = 'legacy' | 'homectl';

export interface StorageConfig {
  mode: StorageMode;
  /**
   * True when `STORAGE_MODE` is unset: the pre-facade behaviour, a single bucket from
   * the `S3_*` variables (with local MinIO defaults). Keeps the Serverless deploy and
   * local dev working unchanged.
   */
  implicit: boolean;
  legacy?: S3BackendConfig;
  homectl?: S3BackendConfig;
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigError';
  }
}

/**
 * Env var prefix per backend. `homectl` uses the names Terraform writes into
 * `reisedagbok-terraform-secrets`, so on the cluster `S3_*` always means the in-cluster
 * bucket; the bucket outside the cluster lives under `LEGACY_S3_*`.
 */
const PREFIX: Record<BackendName, string> = { legacy: 'LEGACY_S3_', homectl: 'S3_' };

/** Region the client signs with when none is configured (the pre-facade value). */
const DEFAULT_REGION = 'us-east-1';

function value(env: Env, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function parseForcePathStyle(raw: string | undefined): boolean {
  // Path-style is required for MinIO and works on Scaleway, so it stays the default.
  if (raw === undefined) return true;
  return !['false', '0', 'no'].includes(raw.toLowerCase());
}

/** Read one backend's config strictly: every required variable must be set. */
export function readBackendConfig(backend: BackendName, env: Env = process.env): S3BackendConfig {
  const p = PREFIX[backend];
  const required = {
    endpoint: `${p}ENDPOINT`,
    bucket: `${p}BUCKET`,
    accessKeyId: `${p}ACCESS_KEY`,
    secretAccessKey: `${p}SECRET_KEY`,
  } as const;
  const missing = Object.values(required).filter((name) => !value(env, name));
  if (missing.length > 0) {
    throw new StorageConfigError(
      `Storage backend "${backend}" is not configured: missing ${missing.join(', ')}`,
    );
  }
  return {
    endpoint: value(env, required.endpoint)!,
    bucket: value(env, required.bucket)!,
    accessKeyId: value(env, required.accessKeyId)!,
    secretAccessKey: value(env, required.secretAccessKey)!,
    region: value(env, `${p}REGION`) ?? DEFAULT_REGION,
    forcePathStyle: parseForcePathStyle(value(env, `${p}FORCE_PATH_STYLE`)),
  };
}

/** Pre-facade config: one bucket from `S3_*`, defaulting to the local MinIO stack. */
function readImplicitLegacyConfig(env: Env): S3BackendConfig {
  return {
    endpoint: value(env, 'S3_ENDPOINT') ?? 'http://localhost:9100',
    bucket: value(env, 'S3_BUCKET') ?? 'travel-journal',
    accessKeyId: value(env, 'S3_ACCESS_KEY') ?? 'minioadmin',
    secretAccessKey: value(env, 'S3_SECRET_KEY') ?? 'minioadmin',
    region: value(env, 'S3_REGION') ?? DEFAULT_REGION,
    forcePathStyle: parseForcePathStyle(value(env, 'S3_FORCE_PATH_STYLE')),
  };
}

export function readStorageConfig(env: Env = process.env): StorageConfig {
  const rawMode = value(env, 'STORAGE_MODE');
  if (rawMode === undefined) {
    return { mode: 'legacy', implicit: true, legacy: readImplicitLegacyConfig(env) };
  }

  const mode = rawMode.toLowerCase() as StorageMode;
  if (!STORAGE_MODES.includes(mode)) {
    throw new StorageConfigError(
      `Invalid STORAGE_MODE "${rawMode}" (expected one of: ${STORAGE_MODES.join(', ')})`,
    );
  }

  if (mode === 'legacy') {
    return { mode, implicit: false, legacy: readBackendConfig('legacy', env) };
  }
  if (mode === 'homectl') {
    return { mode, implicit: false, homectl: readBackendConfig('homectl', env) };
  }

  const legacy = readBackendConfig('legacy', env);
  const homectl = readBackendConfig('homectl', env);
  if (legacy.endpoint === homectl.endpoint && legacy.bucket === homectl.bucket) {
    throw new StorageConfigError(
      'STORAGE_MODE=migrating needs two different buckets, but LEGACY_S3_* and S3_* point at the same one',
    );
  }
  return { mode, implicit: false, legacy, homectl };
}

/** Loggable summary: endpoints and buckets, never credentials. */
export function describeStorageConfig(config: StorageConfig): Record<string, unknown> {
  const describe = (c: S3BackendConfig | undefined) =>
    c && { endpoint: c.endpoint, bucket: c.bucket, region: c.region };
  return {
    mode: config.mode,
    implicit: config.implicit,
    ...(config.legacy && { legacy: describe(config.legacy) }),
    ...(config.homectl && { homectl: describe(config.homectl) }),
  };
}
