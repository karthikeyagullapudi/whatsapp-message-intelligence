import mongoose from 'mongoose';
import { env } from '../../config/env.js';

// A single settings document (key: 'app') holding app-wide state that must
// survive restarts: which group we listen to and the last known WhatsApp state.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'app', unique: true },
    selectedGroupId: { type: String, default: null },
    selectedGroupName: { type: String, default: null },
    waState: { type: String, default: 'stopped' },
    waLastError: { type: String, default: null },
    sessionSavedAt: { type: Date, default: null },
    confidenceThreshold: { type: Number, default: env.CONFIDENCE_THRESHOLD, min: 0, max: 1 },
  },
  { timestamps: true },
);

settingsSchema.statics.get = function get() {
  return this.findOneAndUpdate(
    { key: 'app' },
    { $setOnInsert: { key: 'app' } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
};

settingsSchema.statics.patch = function patch(update) {
  return this.findOneAndUpdate({ key: 'app' }, { $set: update }, { upsert: true, returnDocument: 'after', lean: true });
};

export const Settings = mongoose.model('Settings', settingsSchema);
