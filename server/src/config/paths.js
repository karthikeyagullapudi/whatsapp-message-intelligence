import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Absolute paths, so the app works no matter which folder it is started from.
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const paths = Object.freeze({
  serverRoot,
  mediaDir: path.join(serverRoot, 'storage', 'media'),
  // Chromium profile used by whatsapp-web.js while running (backed up to Mongo).
  waDataDir: path.join(serverRoot, '.wwebjs_auth'),
});
