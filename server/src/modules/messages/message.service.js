import fs from 'node:fs/promises';
import { AppError } from '../../utils/AppError.js';

export function createMessageService({ repository, mediaStorage, emit = () => {} }) {
  async function getOrThrow(id) {
    const message = await repository.findById(id);
    if (!message) throw AppError.notFound('Message not found');
    return message;
  }

  return {
    list: (filters) => repository.list(filters),
    stats: (filters) => repository.countByStatus(filters),
    get: getOrThrow,

    // Absolute path of the stored image, or 404.
    async getMediaFile(id) {
      const message = await getOrThrow(id);
      if (!message.media?.path) throw AppError.notFound('This message has no stored image');
      const filePath = mediaStorage.resolve(message.media.path);
      await fs.access(filePath).catch(() => {
        throw AppError.notFound('Image file is missing from storage');
      });
      return { filePath, mimetype: message.media.mimetype };
    },

    // "Retry" button: put a failed message back in the AI queue with fresh attempts.
    async retry(id) {
      await getOrThrow(id);
      const updated = await repository.updateIfStatus(id, ['failed'], {
        $set: {
          'processing.status': 'pending',
          'processing.attempts': 0,
          'processing.lastError': null,
          'processing.nextRunAt': new Date(),
        },
      });
      if (!updated) throw AppError.conflict('Only failed messages can be retried');
      emit('message:updated', updated);
      return updated;
    },
  };
}
