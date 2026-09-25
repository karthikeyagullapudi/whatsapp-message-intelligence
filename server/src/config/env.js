import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the single .env at the repo root (server/src/config → ../../../.env).
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
dotenv.config({ path: rootEnv, quiet: true });

// Every env var the server reads is declared here, with its type and default.
// If something is missing or malformed the process stops at boot with a clear
// message, instead of failing later in some random place.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  GEMINI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

  WA_CLIENT_ID: z.string().default('main'),
  WA_BACKUP_SYNC_MS: z.coerce.number().int().min(60000).default(300000),
  WA_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  WA_BACKFILL_LIMIT: z.coerce.number().int().min(0).max(500).default(50),
  // Optional: use an installed Chrome instead of the one Puppeteer downloaded.
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
