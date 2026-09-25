import { Message } from './message.model.js';

// Every MongoDB query for messages lives here, so services never build queries.
export const messageRepository = {
  async exists(waMessageId) {
    return Boolean(await Message.exists({ waMessageId }));
  },

  // Insert only if this waMessageId has never been seen.
  // $setOnInsert + upsert makes it atomic: if the same message arrives twice
  // (even at the same moment), the unique index lets only one insert win.
  async insertIfNew(doc) {
    try {
      const res = await Message.updateOne(
        { waMessageId: doc.waMessageId },
        { $setOnInsert: doc },
        { upsert: true },
      );
      return { inserted: res.upsertedCount === 1, id: res.upsertedId ?? null };
    } catch (err) {
      // Two concurrent upserts can race; the loser gets E11000. That is a duplicate, not an error.
      if (err.code === 11000) return { inserted: false, id: null };
      throw err;
    }
  },

  // Earlier original message with the same content inside the time window.
  findRecentByContentHash(contentHash, { from, to }) {
    return Message.findOne({
      contentHash,
      duplicateOf: null,
      timestamp: { $gte: from, $lte: to },
    })
      .sort({ timestamp: -1 })
      .select('_id')
      .lean();
  },

  findById(id) {
    return Message.findById(id).lean();
  },
};
