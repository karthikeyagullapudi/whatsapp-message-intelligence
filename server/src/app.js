import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { isDbConnected } from './config/db.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

// Builds the Express app without calling listen(), so tests can import it
// and hit it with supertest without opening a real port.
// `deps` lets server.js pass in live services (WhatsApp, worker) and lets
// tests pass in fakes.
export function createApp(deps = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test',
      // One short line per request instead of full headers.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ status: res.statusCode }),
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    const db = isDbConnected();
    const whatsapp = deps.whatsapp?.getState?.() ?? 'not_started';
    const worker = deps.worker?.isRunning?.() ?? false;
    res.status(db ? 200 : 503).json({ ok: db, db: db ? 'up' : 'down', whatsapp, worker });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
