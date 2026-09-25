// Runs the labelled dataset through the real model + validator and prints accuracy.
// Usage: npm run eval -w server        (needs GEMINI_API_KEY in .env)
import fs from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { createGeminiProvider } from '../src/modules/ai/ai.provider.js';
import { buildContents, PROMPT_VERSION, SYSTEM_PROMPT } from '../src/modules/ai/ai.prompt.js';
import { CATEGORIES, toGeminiJsonSchema } from '../src/modules/ai/ai.schema.js';
import { getReviewReasons, parseAiOutput } from '../src/modules/ai/ai.validator.js';

const dataset = JSON.parse(await fs.readFile(new URL('./dataset.json', import.meta.url), 'utf8'));
const provider = createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.AI_MODEL, timeoutMs: env.AI_TIMEOUT_MS });
if (!provider.isConfigured()) {
  console.error('GEMINI_API_KEY is not set');
  process.exit(1);
}

const gapMs = Math.ceil(60000 / env.AI_MAX_RPM);
const jsonSchema = toGeminiJsonSchema();
const rows = [];

console.log(`Model ${env.AI_MODEL}, prompt ${PROMPT_VERSION}, ${dataset.length} messages\n`);

for (const [i, item] of dataset.entries()) {
  const message = { groupName: 'Site Ops', senderName: 'Tester', timestamp: new Date(), type: 'text', body: item.body };
  let row = { expected: item.category, body: item.body };
  try {
    const res = await provider.generate({ systemInstruction: SYSTEM_PROMPT, contents: buildContents(message), jsonSchema });
    const parsed = parseAiOutput(res.text);
    row = {
      ...row,
      latencyMs: res.latencyMs,
      valid: parsed.ok,
      got: parsed.ok ? parsed.data.category : 'INVALID',
      confidence: parsed.ok ? parsed.data.confidence : null,
      review: parsed.ok ? getReviewReasons(parsed.data, message, { threshold: env.CONFIDENCE_THRESHOLD }).length > 0 : true,
    };
  } catch (err) {
    row = { ...row, valid: false, got: 'ERROR', error: err.message, review: true };
  }
  rows.push(row);
  const mark = row.got === row.expected ? '✓' : '✗';
  console.log(`${mark} ${String(i + 1).padStart(2)} expected ${row.expected.padEnd(15)} got ${row.got.padEnd(15)} ${row.confidence?.toFixed(2) ?? '    '}  ${item.body.slice(0, 60)}`);
  if (i < dataset.length - 1) await new Promise((r) => setTimeout(r, gapMs));
}

const correct = rows.filter((r) => r.got === r.expected).length;
const valid = rows.filter((r) => r.valid).length;
const latencies = rows.filter((r) => r.latencyMs).map((r) => r.latencyMs).sort((a, b) => a - b);
const wrong = rows.filter((r) => r.got !== r.expected);

console.log('\n--- Summary ---');
console.log(`Accuracy:           ${correct}/${rows.length} (${Math.round((100 * correct) / rows.length)}%)`);
console.log(`Valid JSON/schema:  ${valid}/${rows.length}`);
console.log(`Sent to review:     ${rows.filter((r) => r.review).length}/${rows.length}`);
console.log(`Wrong but caught by review rules: ${wrong.filter((r) => r.review).length}/${wrong.length}`);
console.log(`Latency median:     ${latencies[Math.floor(latencies.length / 2)] ?? '-'} ms, max ${latencies.at(-1) ?? '-'} ms`);
console.log('\nPer category (correct/total):');
for (const c of CATEGORIES) {
  const inCat = rows.filter((r) => r.expected === c);
  if (inCat.length) console.log(`  ${c.padEnd(16)} ${inCat.filter((r) => r.got === c).length}/${inCat.length}`);
}
