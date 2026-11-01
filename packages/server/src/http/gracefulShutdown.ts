import type { Server } from 'node:http';

import { logger } from '../logger.js';

export interface GracefulShutdownOptions {
  server: Server;
  /** Release everything else (cron jobs, DB connection) once the server stopped. */
  cleanup: () => Promise<void> | void;
  /**
   * Hard deadline. Kubernetes sends SIGKILL `terminationGracePeriodSeconds` (30s by
   * default) after SIGTERM, so finish comfortably before that.
   */
  timeoutMs?: number;
  signals?: NodeJS.Signals[];
  exit?: (code: number) => void;
}

/**
 * On SIGTERM/SIGINT: stop accepting connections, let in-flight requests (uploads, media
 * streams) finish, run `cleanup`, then exit. Rolling updates on the cluster then never
 * cut off a request half-way. Returns the shutdown function (for tests).
 */
export function installGracefulShutdown({
  server,
  cleanup,
  timeoutMs = 25_000,
  signals = ['SIGTERM', 'SIGINT'],
  exit = (code) => process.exit(code),
}: GracefulShutdownOptions): (signal: string) => Promise<void> {
  let shuttingDown: Promise<void> | undefined;

  const shutdown = (signal: string): Promise<void> => {
    shuttingDown ??= (async () => {
      logger.info({ signal }, 'Shutting down');
      const deadline = setTimeout(() => {
        logger.warn({ timeoutMs }, 'Graceful shutdown timed out; exiting');
        exit(1);
      }, timeoutMs);
      deadline.unref();

      let code = 0;
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
          // Keep-alive sockets with no request in flight would otherwise hold close().
          server.closeIdleConnections();
        });
        await cleanup();
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        code = 1;
      } finally {
        clearTimeout(deadline);
      }
      logger.info('Shutdown complete');
      exit(code);
    })();
    return shuttingDown;
  };

  for (const signal of signals) {
    process.once(signal, () => void shutdown(signal));
  }
  return shutdown;
}
