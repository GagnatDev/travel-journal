import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

const SERVER_PORT = process.env['SERVER_PORT'] ?? '3101';
const HEALTHZ_URL = `http://localhost:${SERVER_PORT}/healthz`;
const S3_ACCESS_KEY = process.env['S3_ACCESS_KEY'] ?? 'minioadmin';
const S3_SECRET_KEY = process.env['S3_SECRET_KEY'] ?? 'minioadmin';
const SHOULD_USE_TESTCONTAINERS = process.env['E2E_USE_TESTCONTAINERS'] !== '0';
const RUNTIME_STATE_DIR = join(process.cwd(), '.e2e');
const RUNTIME_STATE_PATH = join(RUNTIME_STATE_DIR, 'runtime-state.json');

type E2ERuntimeState = {
  mongodbUri: string;
  s3Endpoint: string;
  s3Bucket: string;
  serverPort: string;
  serverPid: number | null;
};

let serverProcess: ChildProcess | null = null;

async function ensureBucket(
  s3Endpoint: string,
  bucketName: string,
  accessKey: string,
  secretKey: string,
) {
  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });

  const attempts = 12;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      return;
    } catch (err: unknown) {
      const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists') {
        return;
      }

      if (attempt === attempts) {
        throw err;
      }
      await sleep(500);
    }
  }
}

async function startIsolatedInfrastructure() {
  const runId = randomUUID().slice(0, 8);
  const databaseName = `travel-journal-e2e-${runId}`;
  const bucketName = `travel-journal-e2e-${runId}`;

  const mongoContainer = await new GenericContainer('mongo:8')
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
    .start();

  const minioContainer = await new GenericContainer('minio/minio')
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: S3_ACCESS_KEY,
      MINIO_ROOT_PASSWORD: S3_SECRET_KEY,
    })
    .withCommand(['server', '/data'])
    .withWaitStrategy(Wait.forLogMessage('API:'))
    .start();

  const mongoPort = mongoContainer.getMappedPort(27017);
  const minioPort = minioContainer.getMappedPort(9000);
  const mongodbUri = `mongodb://127.0.0.1:${mongoPort}/${databaseName}`;
  const s3Endpoint = `http://127.0.0.1:${minioPort}`;

  await ensureBucket(s3Endpoint, bucketName, S3_ACCESS_KEY, S3_SECRET_KEY);

  return {
    mongodbUri,
    s3Endpoint,
    s3Bucket: bucketName,
    mongoContainer,
    minioContainer,
  };
}

async function persistRuntimeState(state: E2ERuntimeState) {
  await mkdir(RUNTIME_STATE_DIR, { recursive: true });
  await writeFile(RUNTIME_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function startServer(runtimeState: E2ERuntimeState) {
  serverProcess = spawn('node', ['packages/server/dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: runtimeState.serverPort,
      MONGODB_URI: runtimeState.mongodbUri,
      S3_ENDPOINT: runtimeState.s3Endpoint,
      S3_BUCKET: runtimeState.s3Bucket,
      S3_ACCESS_KEY,
      S3_SECRET_KEY,
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'ci-test-secret',
      ADMIN_EMAIL: process.env['ADMIN_EMAIL'] ?? 'admin@localhost',
    },
    stdio: 'pipe',
  });

  serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
  runtimeState.serverPid = serverProcess.pid ?? null;
}

async function waitForServer(url: string, maxMs = 30_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Server at ${url} did not become ready within ${maxMs}ms`);
}

export default async function globalSetup() {
  let runtimeState: E2ERuntimeState;
  let infrastructure:
    | {
        mongoContainer: StartedTestContainer;
        minioContainer: StartedTestContainer;
      }
    | undefined;

  if (SHOULD_USE_TESTCONTAINERS) {
    const isolatedInfrastructure = await startIsolatedInfrastructure();
    runtimeState = {
      mongodbUri: isolatedInfrastructure.mongodbUri,
      s3Endpoint: isolatedInfrastructure.s3Endpoint,
      s3Bucket: isolatedInfrastructure.s3Bucket,
      serverPort: SERVER_PORT,
      serverPid: null,
    };
    infrastructure = {
      mongoContainer: isolatedInfrastructure.mongoContainer as StartedTestContainer,
      minioContainer: isolatedInfrastructure.minioContainer as StartedTestContainer,
    };
  } else {
    runtimeState = {
      mongodbUri:
        process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/travel-journal-test',
      s3Endpoint: process.env['S3_ENDPOINT'] ?? 'http://127.0.0.1:9100',
      s3Bucket: process.env['S3_BUCKET'] ?? 'travel-journal',
      serverPort: SERVER_PORT,
      serverPid: null,
    };
    await ensureBucket(runtimeState.s3Endpoint, runtimeState.s3Bucket, S3_ACCESS_KEY, S3_SECRET_KEY);
  }

  await startServer(runtimeState);
  await waitForServer(HEALTHZ_URL);
  await persistRuntimeState(runtimeState);

  (globalThis as Record<string, unknown>).__e2eServerProcess = serverProcess;
  if (infrastructure) {
    (globalThis as Record<string, unknown>).__e2eMongoContainer = infrastructure.mongoContainer;
    (globalThis as Record<string, unknown>).__e2eMinioContainer = infrastructure.minioContainer;
  }
}
