import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { retry } from '../utils/retry.js';

// Connects to MongoDB, retrying 5 times with backoff (1s, 2s, 4s, 8s).
// If Mongo is still down after that we throw, and server.js exits with a clear log.
export async function connectDb(uri = env.MONGO_URI) {
  mongoose.set('strictQuery', true);

  await retry(() => mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 }), {
    retries: 5,
    base: 1000,
    onError: (err, attempt) =>
      logger.warn({ attempt: attempt + 1, err: err.message }, 'MongoDB connection failed, retrying'),
  });

  logger.info('MongoDB connected');

  // Registered after the first connect, so failed boot attempts don't spam warnings.
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
