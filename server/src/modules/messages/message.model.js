import mongoose from 'mongoose';

export const MESSAGE_TYPES = ['text', 'image', 'unsupported'];

export const PROCESSING_STATUSES = [
  'pending', // saved, waiting for the AI worker
  'processing', // claimed by the worker
  'auto_approved', // AI result valid and confident
  'needs_review', // uncertain / invalid / high-impact → human must check
  'approved', // human reviewed it
  'failed', // AI kept failing after max attempts
  'skipped', // never sent to AI (unsupported type or soft duplicate)
];

const mediaSchema = new mongoose.Schema(
  {
    path: String, // file name inside storage/media
    mimetype: String,
    size: Number,
    sha256: String,
    error: String, // set when the download failed; the message is still kept
  },
  { _id: false },
);

// One document per WhatsApp message. The original message, the AI result and the
// human correction live side by side, so nothing is ever overwritten.
const messageSchema = new mongoose.Schema(
  {
    waMessageId: { type: String, required: true },
    groupId: { type: String, required: true },
    groupName: String,
    senderId: { type: String, required: true },
    senderName: String,
    fromMe: { type: Boolean, default: false },
    timestamp: { type: Date, required: true },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    waType: String, // WhatsApp's own type, e.g. 'chat', 'image', 'video'
    body: { type: String, default: '' }, // original text or image caption, never edited
    media: { type: mediaSchema, default: undefined },
    raw: { type: mongoose.Schema.Types.Mixed }, // trimmed original payload for audit
    source: { type: String, enum: ['live', 'backfill'], default: 'live' },

    contentHash: { type: String, default: null },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },

    processing: {
      status: { type: String, enum: PROCESSING_STATUSES, default: 'pending' },
      skipReason: { type: String, default: null }, // 'unsupported_type' | 'duplicate'
      attempts: { type: Number, default: 0 },
      lastError: { type: String, default: null },
      lockedAt: { type: Date, default: null },
      nextRunAt: { type: Date, default: () => new Date() },
    },

    // Filled in by later parts (AI worker and review screen).
    ai: { type: mongoose.Schema.Types.Mixed, default: null },
    review: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

messageSchema.index({ waMessageId: 1 }, { unique: true }); // hard dedupe
messageSchema.index({ 'processing.status': 1, 'processing.nextRunAt': 1 }); // worker queue
messageSchema.index({ groupId: 1, timestamp: -1 }); // list, newest first
messageSchema.index({ contentHash: 1, timestamp: -1 }); // soft-duplicate lookup

export const Message = mongoose.model('Message', messageSchema);
