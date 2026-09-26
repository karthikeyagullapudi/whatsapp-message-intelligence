// Mirrors server/src/modules/ai/ai.schema.js. The server validates; this is for display.
export const CATEGORIES = [
  { value: 'Incident', color: 'var(--cat-incident)', key: '1' },
  { value: 'Change Request', color: 'var(--cat-change-request)', key: '2' },
  { value: 'Question', color: 'var(--cat-question)', key: '3' },
  { value: 'Resource Update', color: 'var(--cat-resource-update)', key: '4' },
  { value: 'Routine Update', color: 'var(--cat-routine-update)', key: '5' },
  { value: 'Irrelevant', color: 'var(--cat-irrelevant)', key: '6' },
];

export const categoryColor = (name) => CATEGORIES.find((c) => c.value === name)?.color ?? 'var(--text-muted)';

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const STATUSES = [
  { value: 'needs_review', label: 'Needs review', color: 'var(--warning)' },
  { value: 'pending', label: 'Pending', color: 'var(--text-muted)' },
  { value: 'processing', label: 'Processing', color: 'var(--info)' },
  { value: 'auto_approved', label: 'Auto-approved', color: 'var(--text-secondary)' },
  { value: 'approved', label: 'Approved', color: 'var(--text-secondary)' },
  { value: 'failed', label: 'Failed', color: 'var(--danger)' },
  { value: 'skipped', label: 'Skipped', color: 'var(--text-muted)' },
];
export const statusInfo = (value) => STATUSES.find((s) => s.value === value) ?? { value, label: value, color: 'var(--text-muted)' };

export const DEFAULT_THRESHOLD = 0.75;

// Plain-language review reasons, e.g. "Low confidence (0.62) · Incident".
export function describeReviewReasons(message) {
  const ai = message.ai ?? {};
  const parts = (ai.reviewReasons ?? []).map((r) => {
    switch (r) {
      case 'low_confidence':
        return `Low confidence (${ai.confidence?.toFixed(2)})`;
      case 'high_impact_category':
        return ai.category;
      case 'high_priority':
        return 'High priority';
      case 'image_without_caption':
        return 'Image without caption';
      case 'image_unavailable':
        return 'Image could not be downloaded';
      case 'validation_failed':
        return 'AI output was invalid';
      default:
        return r;
    }
  });
  return parts.join(' · ');
}

// The values that count: the reviewer's if reviewed, else the AI's.
export const finalResult = (m) => m.review ?? (m.ai?.category ? m.ai : null);
