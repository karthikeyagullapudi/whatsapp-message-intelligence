import { z } from 'zod';

// Single source of truth for the AI result. It is used to:
//  1. tell Gemini the exact JSON shape to return (via toJSONSchema below),
//  2. validate what Gemini actually returned,
//  3. validate the reviewer's corrections (review module reuses these pieces).
// Adding a 7th category = adding one string here.

export const CATEGORIES = [
  'Routine Update',
  'Incident',
  'Change Request',
  'Resource Update',
  'Question',
  'Irrelevant',
];

export const PRIORITIES = ['low', 'medium', 'high'];

export const ResourceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: z.number().nullable(),
  unit: z.string().trim().max(30).nullable(),
});

export const EntitiesSchema = z.object({
  location: z.string().trim().max(120).nullable(),
  people: z.array(z.string().trim().min(1).max(80)).max(20),
  dates: z.array(z.string()).max(10), // ISO 8601; parse-checked in ai.validator.js
  resources: z.array(ResourceSchema).max(20),
});

export const AiResultSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().max(200),
  priority: z.enum(PRIORITIES),
  actionRequired: z.boolean(),
  entities: EntitiesSchema,
  reasoning: z.string().trim().max(300),
});

// JSON Schema sent to Gemini as `responseJsonSchema`, so the model is forced
// into this shape at generation time (we still validate afterwards).
export function toGeminiJsonSchema(schema = AiResultSchema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}
