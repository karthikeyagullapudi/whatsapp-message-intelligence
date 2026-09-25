import { describe, expect, it } from 'vitest';
import { getReviewReasons, parseAiOutput } from '../../src/modules/ai/ai.validator.js';
import { validIncident, validRoutine } from '../fixtures/aiOutputs.js';

const json = (o) => JSON.stringify(o);

describe('parseAiOutput', () => {
  it('accepts a valid result and cleans it up', () => {
    const r = parseAiOutput(json(validIncident));
    expect(r.ok).toBe(true);
    expect(r.data.category).toBe('Incident');
    expect(r.data.entities.people).toEqual(['Ravi']); // "@" removed
  });

  it('accepts JSON wrapped in a ```json code fence', () => {
    expect(parseAiOutput('```json\n' + json(validRoutine) + '\n```').ok).toBe(true);
  });

  it('rejects non-JSON', () => {
    expect(parseAiOutput('Sure! This is an incident.')).toMatchObject({
      ok: false,
      errors: ['Response is not valid JSON'],
    });
  });

  it('rejects an unknown category', () => {
    const r = parseAiOutput(json({ ...validIncident, category: 'Emergency' }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/^category:/);
  });

  it('rejects missing fields and confidence out of range', () => {
    const { summary, ...noSummary } = validIncident;
    expect(parseAiOutput(json(noSummary)).errors.some((e) => e.startsWith('summary'))).toBe(true);
    expect(parseAiOutput(json({ ...validIncident, confidence: 1.4 })).errors[0]).toMatch(/^confidence:/);
  });

  it('rejects an empty summary for non-Irrelevant messages', () => {
    const r = parseAiOutput(json({ ...validIncident, summary: '' }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/summary: must not be empty/);
  });

  it('forces actionRequired=false for Irrelevant, drops invalid dates, truncates long text', () => {
    const r = parseAiOutput(
      json({
        ...validRoutine,
        category: 'Irrelevant',
        actionRequired: true,
        summary: 'x'.repeat(250),
        entities: { ...validRoutine.entities, dates: ['2026-09-26', 'next-ish week'] },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.data.actionRequired).toBe(false);
    expect(r.data.entities.dates).toEqual(['2026-09-26']);
    expect(r.data.summary).toHaveLength(200);
    expect(r.warnings).toHaveLength(3);
  });
});

describe('getReviewReasons', () => {
  const text = { type: 'text', body: 'hello' };

  it('auto-approves a confident, low-impact result', () => {
    expect(getReviewReasons(validRoutine, text)).toEqual([]);
  });

  it('flags low confidence using the configured threshold', () => {
    const r = { ...validRoutine, confidence: 0.6 };
    expect(getReviewReasons(r, text)).toEqual(['low_confidence']);
    expect(getReviewReasons(r, text, { threshold: 0.5 })).toEqual([]);
  });

  it('always sends Incidents / high priority to review, even when confident', () => {
    expect(getReviewReasons(validIncident, text)).toEqual(['high_impact_category', 'high_priority']);
  });

  it('flags images without caption', () => {
    expect(getReviewReasons(validRoutine, { type: 'image', body: '' })).toEqual(['image_without_caption']);
  });
});
