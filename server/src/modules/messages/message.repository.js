import { Message } from './message.model.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The category a message "really" has: the reviewer's if reviewed, else the AI's.
function categoryFilter(category) {
  return {
    $or: [{ 'review.category': category }, { review: null, 'ai.category': category }],
  };
}

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

  async list({ status, category, q, page = 1, limit = 20, sort = 'newest' } = {}) {
    const filter = {};
    const and = [];
    if (status) filter['processing.status'] = status;
    if (category) and.push(categoryFilter(category));
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      and.push({ $or: [{ body: rx }, { senderName: rx }, { 'ai.summary': rx }, { 'review.summary': rx }] });
    }
    if (and.length) filter.$and = and;

    const [items, total] = await Promise.all([
      Message.find(filter)
        .sort({ timestamp: sort === 'oldest' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-raw')
        .lean(),
      Message.countDocuments(filter),
    ]);
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  },

  async countByStatus() {
    const rows = await Message.aggregate([{ $group: { _id: '$processing.status', count: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
  },

  // Only updates if the message is still in one of `fromStatuses`, so a human
  // action and the worker can never overwrite each other.
  updateIfStatus(id, fromStatuses, update) {
    return Message.findOneAndUpdate({ _id: id, 'processing.status': { $in: fromStatuses } }, update, {
      returnDocument: 'after',
      lean: true,
    });
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
