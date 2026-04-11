import mongoose from 'mongoose';

import { logger } from './logger.js';

export async function connectDb(uri: string): Promise<void> {
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
