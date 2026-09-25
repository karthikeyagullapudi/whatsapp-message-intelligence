import { z } from 'zod';
import { CATEGORIES, EntitiesSchema, PRIORITIES } from '../ai/ai.schema.js';

// The reviewer edits the same fields the AI produced, so the body reuses the AI
// schema pieces (zod). If a category is added in ai.schema.js, this accepts it too.
export const ReviewSchema = z
  .object({
    category: z.enum(CATEGORIES),
    summary: z.string().trim().min(1, 'summary is required').max(200),
    priority: z.enum(PRIORITIES),
    actionRequired: z.boolean(),
    entities: EntitiesSchema,
    notes: z.string().trim().max(500).optional().default(''),
    reviewedBy: z.string().trim().min(1).max(60).optional().default('reviewer'),
  })
  .strict(); // unknown fields (e.g. trying to overwrite `ai`) → 400

export const EDITABLE_FIELDS = ['category', 'summary', 'priority', 'actionRequired', 'entities'];
