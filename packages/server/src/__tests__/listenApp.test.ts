import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { listenApp } from '../http/listenApp.js';

function closeServer(server: { close: (cb: (err?: Error) => void) => void } | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

describe('listenApp', () => {
  const servers: Array<{ close: (cb: (err?: Error) => void) => void }> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await closeServer(servers.pop());
    }
  });

  it('calls onListening when the port is free', async () => {
    const app = createApp();
    const port = await new Promise<number>((resolve, reject) => {
      const server = listenApp(
        app,
        0,
        (started) => {
          resolve((started.address() as AddressInfo).port);
        },
        reject,
      );
      servers.push(server);
    });

    expect(port).toBeGreaterThan(0);
  });

  it('calls onError with EADDRINUSE instead of reporting a successful listen', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, () => resolve());
    });
    servers.push(blocker);
    const port = (blocker.address() as AddressInfo).port;

    const app = createApp();
    const err = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
      const server = listenApp(
        app,
        port,
        () => {
          reject(new Error('listen callback reported success on a busy port'));
        },
        resolve,
      );
      servers.push(server);
    });

    expect(err.code).toBe('EADDRINUSE');
  });
});
