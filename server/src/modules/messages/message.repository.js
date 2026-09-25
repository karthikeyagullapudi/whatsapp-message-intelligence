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

  // ---- AI job queue (MongoDB is the queue: processing.status is the job state) ----

  // Atomically take the oldest due job. findOneAndUpdate is a single atomic
  // operation, so two workers can never claim the same message.
  claimNextJob(now = new Date()) {
    return Message.findOneAndUpdate(
      { 'processing.status': 'pending', 'processing.nextRunAt': { $lte: now } },
      {
        $set: { 'processing.status': 'processing', 'processing.lockedAt': now },
        $inc: { 'processing.attempts': 1 },
      },
      { sort: { 'processing.nextRunAt': 1 }, returnDocument: 'after', lean: true },
    );
  },

  // The status filter makes sure we only finish a job we still own.
  completeJob(id, { status, ai }) {
    return Message.findOneAndUpdate(
      { _id: id, 'processing.status': 'processing' },
      {
        $set: {
          'processing.status': status,
          'processing.lockedAt': null,
          'processing.lastError': null,
          ai,
        },
      },
      { returnDocument: 'after', lean: true },
    );
  },

  retryJobLater(id, { error, nextRunAt }) {
    return Message.findOneAndUpdate(
      { _id: id, 'processing.status': 'processing' },
      {
        $set: {
          'processing.status': 'pending',
          'processing.lockedAt': null,
          'processing.lastError': error,
          'processing.nextRunAt': nextRunAt,
        },
      },
      { returnDocument: 'after', lean: true },
    );
  },

  failJob(id, { error }) {
    return Message.findOneAndUpdate(
      { _id: id, 'processing.status': 'processing' },
      { $set: { 'processing.status': 'failed', 'processing.lockedAt': null, 'processing.lastError': error } },
      { returnDocument: 'after', lean: true },
    );
  },

  // Crash recovery: a job stuck in 'processing' longer than `olderThanMs` belonged
  // to a worker that died; put it back in the queue.
  async resetStaleJobs(olderThanMs, now = new Date()) {
    const res = await Message.updateMany(
      { 'processing.status': 'processing', 'processing.lockedAt': { $lt: new Date(now - olderThanMs) } },
      { $set: { 'processing.status': 'pending', 'processing.lockedAt': null, 'processing.nextRunAt': now } },
    );
    return res.modifiedCount;
  },
};
