import http from 'node:http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { paths } from './config/paths.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';
import { closeSocket, emit, initSocket } from './realtime/socket.js';
import { Settings } from './modules/settings/settings.model.js';
import { messageRepository } from './modules/messages/message.repository.js';
import { createMediaStorage } from './modules/messages/media.storage.js';
import { MongoSessionStore } from './modules/whatsapp/whatsapp.sessionStore.js';
import { WhatsAppConnection } from './modules/whatsapp/whatsapp.client.js';
import { createMessageListener } from './modules/whatsapp/whatsapp.listener.js';
import { createWhatsAppService } from './modules/whatsapp/whatsapp.service.js';

// Boot order: database → wiring → HTTP + sockets → WhatsApp (→ AI worker, later part).
// All objects are created here and passed in (dependency injection), so every
// module can be tested alone with fakes.
async function main() {
  try {
    await connectDb();
  } catch (err) {
    logger.fatal({ err: err.message }, 'Could not connect to MongoDB after retries, exiting');
    process.exit(1);
  }

  const connection = new WhatsAppConnection({
    store: new MongoSessionStore({ dataPath: paths.waDataDir, connection: mongoose.connection }),
    clientId: env.WA_CLIENT_ID,
    dataPath: paths.waDataDir,
    backupSyncMs: env.WA_BACKUP_SYNC_MS,
    headless: env.WA_HEADLESS,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH,
    logger: logger.child({ module: 'whatsapp' }),
  });

  const listener = createMessageListener({
    repository: messageRepository,
    mediaStorage: createMediaStorage(),
    logger: logger.child({ module: 'listener' }),
    emit,
  });

  const whatsappService = createWhatsAppService({
    connection,
    listener,
    Settings,
    emit,
    logger: logger.child({ module: 'whatsapp' }),
    backfillLimit: env.WA_BACKFILL_LIMIT,
  });
  await whatsappService.init();

  const app = createApp({ whatsappService });
  const server = http.createServer(app);
  initSocket(server, {
    origin: env.CLIENT_ORIGIN,
    // A browser that connects late still gets the current status (and QR) straight away.
    onConnect: (socket) => socket.emit('wa:state', whatsappService.getStatus()),
  });

  server.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}`));

  // Started after the API is up: launching Chromium takes a while and must
  // never block (or crash) the API.
  connection.start();

  // Graceful shutdown: stop taking requests, then close resources in reverse order.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    await connection.stop().catch(() => {});
    await closeSocket();
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
