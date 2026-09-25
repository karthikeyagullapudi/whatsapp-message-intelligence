import crypto from 'node:crypto';

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// "  Pump 3 is   LEAKING!! " and "pump 3 is leaking!!" should count as the same text.
export function normalizeText(text = '') {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
