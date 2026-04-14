import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

function loadEnvFile() {
  const envFile = process.env.E2E_ENV_FILE;
  if (!envFile) {
    return {};
  }

  const envPath = resolve(process.cwd(), envFile);
  if (!existsSync(envPath)) {
    throw new Error(`E2E env file not found: ${envFile}`);
  }

  return parseEnv(readFileSync(envPath, 'utf8'));
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function pickClientPort() {
  const requested = process.env.E2E_VITE_PORT ? Number(process.env.E2E_VITE_PORT) : 5173;
  if (Number.isInteger(requested) && requested > 0 && (await isPortAvailable(requested))) {
    return requested;
  }

  for (let port = 4173; port < 4273; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error('Unable to find a free port for Playwright webServer (checked 5173 and 4173-4272).');
}

async function main() {
  const fileEnv = loadEnvFile();
  const port = await pickClientPort();
  const args = process.argv.slice(2);
  const child = spawn('pnpm', ['exec', 'playwright', 'test', ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...fileEnv,
      E2E_VITE_PORT: String(port),
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
