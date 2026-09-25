import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { sha256 } from '../../utils/hash.js';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Saves image bytes as storage/media/<sha256>.<ext>.
// Naming by content hash means the same image sent twice is stored once.
export function createMediaStorage({ dir = paths.mediaDir } = {}) {
  return {
    dir,

    async save({ data, mimetype }) {
      const buffer = Buffer.from(data, 'base64');
      const hash = sha256(buffer);
      const cleanType = (mimetype || '').split(';')[0].trim();
      const fileName = `${hash}.${EXTENSIONS[cleanType] ?? 'bin'}`;

      await fs.mkdir(dir, { recursive: true });
      // 'wx' = fail if the file already exists, which is fine: same bytes.
      await fs.writeFile(path.join(dir, fileName), buffer, { flag: 'wx' }).catch((err) => {
        if (err.code !== 'EEXIST') throw err;
      });

      return { path: fileName, mimetype: cleanType, size: buffer.length, sha256: hash };
    },

    resolve(fileName) {
      // basename() blocks path traversal like "../../.env"
      return path.join(dir, path.basename(fileName));
    },
  };
}
