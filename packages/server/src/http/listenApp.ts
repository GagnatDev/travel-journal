import type { Server } from 'node:http';

import type { Express } from 'express';

/**
 * Express 5 forwards bind failures such as `EADDRINUSE` to the listen
 * callback instead of throwing them. Callers must treat a first-argument
 * error as a failed start, not as a successful listen.
 *
 * @see https://expressjs.com/en/guide/migrating-5.html#app-listen
 */
export function listenApp(
  app: Express,
  port: number,
  onListening: (server: Server) => void,
  onError: (err: NodeJS.ErrnoException) => void,
): Server {
  const server = app.listen(port, (err?: Error) => {
    if (err) {
      onError(err);
      return;
    }
    onListening(server);
  });
  return server;
}
