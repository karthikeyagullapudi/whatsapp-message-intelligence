import { AiResultSchema } from './ai.schema.js';

// Pure functions: model text in → validated result + review decision out.
// Nothing the model returns is trusted until it passes through here.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function truncate(value, max) {
  return typeof value === 'string' && value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Step 1: parse + schema. Returns { ok, data?, errors[], warnings[] }.
export function parseAiOutput(text) {
  let json;
  try {
    json = JSON.parse(stripCodeFence(text ?? ''));
  } catch {
    return { ok: false, errors: ['Response is not valid JSON'], warnings: [] };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['Response must be a JSON object'], warnings: [] };
  }

  // Harmless overflow (text a bit too long) is trimmed instead of failing the result.
  const warnings = [];
  for (const [field, max] of [['summary', 200], ['reasoning', 300]]) {
    if (typeof json[field] === 'string' && json[field].length > max) {
      json[field] = truncate(json[field], max);
      warnings.push(`${field} was longer than ${max} characters and was truncated`);
    }
  }

  const parsed = AiResultSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
    return { ok: false, errors, warnings };
  }

  return applyBusinessRules(parsed.data, warnings);
}

// Step 2: rules the schema cannot express.
export function applyBusinessRules(result, warnings = []) {
  const data = structuredClone(result);
  const errors = [];

  if (data.category === 'Irrelevant' && data.actionRequired) {
    data.actionRequired = false;
    warnings.push('actionRequired forced to false for an Irrelevant message');
  }

  if (data.category !== 'Irrelevant' && !data.summary) {
    errors.push('summary: must not be empty unless the category is Irrelevant');
  }

  const validDates = data.entities.dates.filter((d) => ISO_DATE.test(d) && !Number.isNaN(Date.parse(d)));
  if (validDates.length !== data.entities.dates.length) {
    const dropped = data.entities.dates.filter((d) => !validDates.includes(d));
    warnings.push(`Removed dates that are not valid ISO 8601: ${dropped.join(', ')}`);
    data.entities.dates = validDates;
  }

  data.entities.people = [...new Set(data.entities.people.map((p) => p.replace(/^@/, '')))];

  return errors.length ? { ok: false, errors, warnings } : { ok: true, data, errors: [], warnings };
}

export const HIGH_IMPACT_CATEGORIES = new Set(['Incident', 'Change Request']);

// Step 3: should a human check this? Returns the list of reasons (empty = auto-approve).
// Confidence alone is not enough: LLM self-reported confidence is poorly calibrated,
// so mistakes that would be expensive always go to a human.
export function getReviewReasons(result, message, { threshold = 0.75 } = {}) {
  const reasons = [];
  if (result.confidence < threshold) reasons.push('low_confidence');
  if (HIGH_IMPACT_CATEGORIES.has(result.category)) reasons.push('high_impact_category');
  if (result.priority === 'high') reasons.push('high_priority');
  if (message.type === 'image' && !message.body?.trim()) reasons.push('image_without_caption');
  if (message.type === 'image' && message.media?.error) reasons.push('image_unavailable');
  return reasons;
}
