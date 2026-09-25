import http from 'node:http';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';

// Boot order: database → (WhatsApp → AI worker, added in later parts) → HTTP.
async function main() {
  try {
    await connectDb();
  } catch (err) {
    logger.fatal({ err: err.message }, 'Could not connect to MongoDB after retries, exiting');
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));

  // Graceful shutdown: stop taking requests, then close resources in reverse order.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    server.close();
    await disconnectDb().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Log instead of crashing silently on a forgotten await somewhere.
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));

main();
