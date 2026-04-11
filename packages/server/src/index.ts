import { createApp } from './app.js';
import { connectDb } from './db.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env['PORT'] ?? '3100', 10);
const MONGODB_URI = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal';

async function main() {
  await connectDb(MONGODB_URI);

  const app = createApp();

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server listening');
  });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
