import { withTimeout } from '../../utils/retry.js';
import { computeContentHash, isFromGroup, mapMessage, shouldIgnore } from './whatsapp.mapper.js';

const TEN_MINUTES = 10 * 60 * 1000;

// Turns a raw WhatsApp message into a saved document. It ONLY saves: it never
// calls the AI, so a slow or broken model can never cause a message to be lost.
//
// handle() returns what happened, which the backfill uses for its summary:
//   'ignored' | 'duplicate' | 'soft_duplicate' | 'inserted' | 'error'
export function createMessageListener({
  repository,
  mediaStorage,
  logger,
  emit = () => {},
  duplicateWindowMs = TEN_MINUTES,
  mediaTimeoutMs = 30000,
}) {
  async function resolveSenderName(msg) {
    if (msg._data?.notifyName) return msg._data.notifyName;
    try {
      const contact = await withTimeout(msg.getContact(), 5000, 'getContact');
      return contact?.pushname || contact?.name || null;
    } catch {
      return null; // a missing name is not worth losing the message over
    }
  }

  async function downloadImage(msg) {
    try {
      const media = await withTimeout(msg.downloadMedia(), mediaTimeoutMs, 'downloadMedia');
      if (!media?.data) return { error: 'Media is no longer available on WhatsApp' };
      return await mediaStorage.save(media);
    } catch (err) {
      return { error: err.message };
    }
  }

  async function handle(msg, { group, source = 'live' }) {
    if (!group || !isFromGroup(msg, group.id) || shouldIgnore(msg)) return 'ignored';

    // 1. Hard duplicate: this exact WhatsApp message is already stored.
    //    Checked first so a redelivered image is not downloaded again.
    if (await repository.exists(msg.id._serialized)) return 'duplicate';

    const doc = mapMessage(msg, { groupName: group.name, senderName: await resolveSenderName(msg), source });

    if (doc.type === 'image') {
      // If the download fails we still keep the message (and its caption).
      doc.media = await downloadImage(msg);
      if (doc.media.error) logger.warn({ waMessageId: doc.waMessageId, err: doc.media.error }, 'Image download failed');
    }

    // 2. Soft duplicate: same sender, same text/image within 10 minutes.
    //    Stored and visible, but not sent to the AI again.
    doc.contentHash = computeContentHash({ ...doc, mediaSha256: doc.media?.sha256 });
    if (doc.contentHash && doc.processing.status === 'pending') {
      const original = await repository.findRecentByContentHash(doc.contentHash, {
        from: new Date(doc.timestamp.getTime() - duplicateWindowMs),
        to: doc.timestamp,
      });
      if (original) {
        doc.duplicateOf = original._id;
        doc.processing.status = 'skipped';
        doc.processing.skipReason = 'duplicate';
      }
    }

    // 3. Atomic insert; a race with another delivery of the same message is a no-op.
    const { inserted, id } = await repository.insertIfNew(doc);
    if (!inserted) return 'duplicate';

    logger.info(
      { id, type: doc.type, sender: doc.senderName, status: doc.processing.status, source },
      'Message saved',
    );
    emit('message:new', {
      _id: id,
      waMessageId: doc.waMessageId,
      senderName: doc.senderName,
      type: doc.type,
      body: doc.body,
      timestamp: doc.timestamp,
      status: doc.processing.status,
    });
    return doc.duplicateOf ? 'soft_duplicate' : 'inserted';
  }

  return {
    // Never throws: this runs inside WhatsApp event handlers.
    async handle(msg, options) {
      try {
        return await handle(msg, options);
      } catch (err) {
        logger.error({ err, waMessageId: msg?.id?._serialized }, 'Failed to save message');
        return 'error';
      }
    },
  };
}
