import { ChildProcess, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';

const S3_ENDPOINT = process.env['S3_ENDPOINT'] ?? 'http://localhost:9100';
const S3_BUCKET = process.env['S3_BUCKET'] ?? 'travel-journal';
const S3_ACCESS_KEY = process.env['S3_ACCESS_KEY'] ?? 'minioadmin';
const S3_SECRET_KEY = process.env['S3_SECRET_KEY'] ?? 'minioadmin';
const MONGODB_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-e2e';
const SERVER_PORT = process.env['SERVER_PORT'] ?? '3101';
const HEALTHZ_URL = `http://localhost:${SERVER_PORT}/healthz`;

let serverProcess: ChildProcess | null = null;

async function ensureBucket() {
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: 'us-east-1',
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
    forcePathStyle: true,
  });

  try {
    await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  } catch (err: unknown) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      throw err;
    }
  }
}

async function startServer() {
  serverProcess = spawn(
    'node',
    ['packages/server/dist/index.js'],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: SERVER_PORT,
        MONGODB_URI,
        S3_ENDPOINT,
        S3_BUCKET,
        S3_ACCESS_KEY,
        S3_SECRET_KEY,
        JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-test-secret',
        ADMIN_EMAIL: process.env['ADMIN_EMAIL'] ?? 'admin@localhost',
      },
      stdio: 'pipe',
    },
  );

  serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
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
  await ensureBucket();
  await startServer();
  await waitForServer(HEALTHZ_URL);

  // Expose server process for teardown
  (globalThis as Record<string, unknown>).__e2eServerProcess = serverProcess;
}
