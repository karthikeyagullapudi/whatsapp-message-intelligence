# AI approach and model choice

Each message is sent to an AI model once. The model returns the category and the key details in a fixed format. The app **checks that answer before trusting it**, and then decides whether a person needs to review it.

## Model choice

I use Google's **Gemini Flash-Lite** (`gemini-3.5-flash-lite`), a small, fast and low-cost model. Classifying short chat messages doesn't need a large model, and in testing it answered in about 2 seconds per message.

Two features decided it for me. First, it reads images, so a photo of damage with no caption can still be classified. Second, Gemini can be forced to answer in an exact structure (a JSON schema). In my evaluation all 20 answers came back in the correct format, which is not guaranteed with models that only promise "some valid JSON". It is also inexpensive, and its free tier was enough for development.

Alternatives considered: OpenAI's GPT models and Anthropic's Claude would both work and are the easiest to swap in. I ruled out Kimi because it only guarantees valid JSON rather than the exact fields I need, it costs more, and its API is hosted in China, which is a data-residency concern for company conversations.

The AI code sits behind a small adapter ([ai.provider.js](../server/src/modules/ai/ai.provider.js)), so switching to another provider means changing one file.

## What is extracted

| Field | Meaning | Example |
| --- | --- | --- |
| Category | One of the six categories | Incident |
| Confidence | How sure the model is (0 to 1) | 0.82 |
| Summary | One short sentence in English | "Pump 3 at Block B leaking since 9 AM" |
| Priority | Low, medium or high | High |
| Action required | Does someone need to act or reply? | Yes |
| Location | Place mentioned | Block B |
| People | Names mentioned | Ravi |
| Dates | Dates and times, including "tomorrow" converted to a real date | 2026-09-26 09:00 |
| Resources | Materials or equipment, with quantity | 40 bags of cement |
| Reasoning | Why the AI chose this category (shown to the reviewer) | "Reports an equipment failure" |

These fields are defined once ([ai.schema.js](../server/src/modules/ai/ai.schema.js)) and reused for the instructions to Gemini, for checking its answer, and for checking the reviewer's corrections. Adding a new category is a one-line change there (plus a short description in the instructions).

## Instructions to the model

The instructions ([ai.prompt.js](../server/src/modules/ai/ai.prompt.js)) include:

- **A clear definition of each category**, plus rules for close calls. For example, a message that reports a problem *and* asks a question is an Incident.
- **Rules for the details:** do not guess; give an honest confidence; turn words like "tomorrow" into a real date based on when the message was sent.
- **Eight worked examples,** including a sarcastic message and one written in Telugu with English letters.
- **Protection against manipulation:** the message is treated as information, never as instructions to follow.
- **Consistent answers:** randomness is turned off, so the same message gets the same answer.

## Checking the AI's answer

Before a result is saved, it goes through four checks:

1. **Is it readable?** The answer must be valid JSON.
2. **Is it complete and correct?** The category must be one of the six, confidence must be between 0 and 1, and all fields must be present.
3. **Does it make sense?** A summary is required, an "Irrelevant" message cannot require action, and invalid dates are removed.
4. **One chance to fix it:** if the answer fails, the model is shown its mistake and asked to correct it. If it fails again, the message goes to a person for review. It is never silently accepted or dropped.

## When a person reviews a result

A message goes to the **Inbox** for review if any of these apply:

| Reason | Why |
| --- | --- |
| The AI is less than 75% confident | It is unsure |
| It is an Incident or a Change Request | Mistakes here are costly, so a person always checks |
| It is marked high priority | Same reason |
| It is an image without a caption, or the image could not be downloaded | Too little information |
| The AI's answer failed the checks | It cannot be trusted |

The AI's confidence score alone is not enough: models can be confidently wrong. That is why important categories always go to a person.

All other messages are **auto-approved**, but they remain visible and editable. When a person approves a message, their answer is saved **next to** the AI's (not over it), along with which fields they changed. Over time this shows how accurate the AI is, and on which fields.

## Reliability

Messages are always saved before the AI sees them, so an AI outage delays classification but never loses anything. The worker claims each message in a single step, which means a message is never processed twice.

When a request fails for a temporary reason (the service is busy, slow or unreachable), the message goes back in the queue and is retried after 10 seconds, then 20. After three attempts it is marked failed, and a reviewer can retry it with one click. Errors that won't fix themselves, such as an invalid API key, are marked failed straight away instead of wasting retries.

A few smaller safeguards: each request times out after 30 seconds; the worker sends at most 10 requests a minute, so a burst of messages after a reconnect stays within the provider's limits; and if the server stops halfway through a message, that message is picked up again when it restarts. At startup the app also checks the API key and model, and reports a problem immediately rather than failing on the first message.

## Evaluation

`npm run eval` runs 20 labelled example messages (separate from the examples in the instructions) through the real model.

| Result (26 Sep 2026) | |
| --- | --- |
| Correct category | **20 out of 20** (all six categories) |
| Answers in the correct format | 20 out of 20 |
| Sent to review | 8 out of 20 (all Incidents and Change Requests, as intended) |
| Response time | about 2.3 seconds (median) |

A further check on 8 other messages was also 8 out of 8. This included one written in Telugu with English letters, which was correctly identified as an Incident. On real messages from a test group, an unclear message was given low confidence and correctly sent for review.

**Note:** these are 20 self-written, mostly clear-cut messages. They show the pipeline works end to end, but they do not prove real-world accuracy. The next step would be testing on a larger set of real, labelled messages, and tracking reviewer corrections over time.
