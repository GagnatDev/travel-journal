import mongoose from 'mongoose';

const MONGODB_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/travel-journal-e2e';

export default async function globalTeardown() {
  // Kill the server process
  const server = (globalThis as Record<string, unknown>).__e2eServerProcess as
    | { kill: (signal?: string) => void }
    | null
    | undefined;

  if (server) {
    server.kill('SIGTERM');
  }

  // Drop the test database
  try {
    await mongoose.connect(MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  } catch {
    // best effort
  }
}
