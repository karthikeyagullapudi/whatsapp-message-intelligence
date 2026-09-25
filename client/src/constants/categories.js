// Mirrors server/src/modules/ai/ai.schema.js (the server validates; this is for the UI).
export const CATEGORIES = [
  'Routine Update',
  'Incident',
  'Change Request',
  'Resource Update',
  'Question',
  'Irrelevant',
];

export const PRIORITIES = ['low', 'medium', 'high'];

export const STATUSES = [
  'pending',
  'processing',
  'needs_review',
  'auto_approved',
  'approved',
  'failed',
  'skipped',
];

export const REVIEW_REASON_LABELS = {
  low_confidence: 'AI confidence is below the threshold',
  high_impact_category: 'Incident / Change Request: always checked by a person',
  high_priority: 'AI marked it high priority',
  image_without_caption: 'Image with no caption (little context)',
  image_unavailable: 'Image could not be downloaded, only the caption was classified',
  validation_failed: 'AI output was invalid even after a repair attempt',
};

// The category that counts: the reviewer's if reviewed, else the AI's.
export const finalResult = (m) => m.review ?? m.ai ?? null;
