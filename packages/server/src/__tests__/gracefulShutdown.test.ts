import { createServer, request, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installGracefulShutdown } from '../http/gracefulShutdown.js';

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

function listen(handler: RequestListener): Promise<number> {
  server = createServer(handler);
  return new Promise((resolve) => {
    server!.listen(0, () => resolve((server!.address() as AddressInfo).port));
  });
}

function get(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    request({ port, path: '/' }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => resolve(body));
    })
      .on('error', reject)
      .end();
  });
}

describe('installGracefulShutdown', () => {
  it('lets an in-flight request finish, then cleans up and exits 0', async () => {
    let finishRequest!: () => void;
    const port = await listen((_req, res) => {
      finishRequest = () => res.end('done');
    });
    const cleanup = vi.fn();
    const exit = vi.fn();
    const shutdown = installGracefulShutdown({ server: server!, cleanup, exit, signals: [] });

    const response = get(port);
    await vi.waitFor(() => expect(finishRequest).toBeTypeOf('function'));

    const stopped = shutdown('SIGTERM');
    expect(cleanup).not.toHaveBeenCalled();

    finishRequest();
    expect(await response).toBe('done');
    await stopped;

    expect(cleanup).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('only shuts down once when signalled repeatedly', async () => {
    await listen((_req, res) => res.end('ok'));
    const cleanup = vi.fn();
    const exit = vi.fn();
    const shutdown = installGracefulShutdown({ server: server!, cleanup, exit, signals: [] });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('exits 1 when cleanup fails', async () => {
    await listen((_req, res) => res.end('ok'));
    const exit = vi.fn();
    const shutdown = installGracefulShutdown({
      server: server!,
      cleanup: () => Promise.reject(new Error('db close failed')),
      exit,
      signals: [],
    });

    await shutdown('SIGTERM');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forces exit 1 when a request outlives the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let started = false;
      const port = await listen(() => {
        started = true; // never responds
      });
      const exit = vi.fn();
      const shutdown = installGracefulShutdown({
        server: server!,
        cleanup: vi.fn(),
        exit,
        timeoutMs: 1_000,
        signals: [],
      });

      get(port).catch(() => undefined);
      await vi.waitFor(() => expect(started).toBe(true));
      void shutdown('SIGTERM');
      vi.advanceTimersByTime(1_000);

      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
      server?.closeAllConnections();
    }
  });
});
