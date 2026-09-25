# Known limitations and production risks

## Known limitations

- **Unofficial integration.** whatsapp-web.js automates WhatsApp Web and depends on its internal modules. A WhatsApp Web update can break it until the library catches up; four such issues were already found and worked around (see [WHATSAPP_INTEGRATION.md](WHATSAPP_INTEGRATION.md)).
- **One account, one group, one process.** Listener, worker and API run in one Node process; there is no multi-tenant support.
- **No login on the review screen.** Anyone who can reach the UI can review; `reviewedBy` is a free-text name.
- **Message types.** Only text and images are classified. Video, voice notes, documents, stickers and polls are stored as `unsupported`. **Edits and deletions** of already stored messages are not tracked, and replies are classified without the quoted message.
- **Backfill depth.** After downtime, only the last 50 messages of the group are fetched. A longer outage in a busy group can miss messages (configurable with `WA_BACKFILL_LIMIT`).
- **Session backup delay.** The first session backup happens about 60 s after login; restarting before that requires a new QR. Later changes are backed up every 5 minutes.
- **Soft-duplicate race.** Two identical messages arriving at the same instant can both be classified; the hard dedupe on the message id is atomic, the 10-minute content check is not.
- **Images on local disk** (`server/storage/media`), not shared storage.
- **LLM limits.** Self-reported confidence is not calibrated; the 20-message eval is small and self-written; each message is classified without the conversation around it (e.g. "same here" or "done" depend on context).
- **Rate limits.** The worker is capped at 10 requests/min for the free tier; a large backfill takes a few minutes to classify (messages are saved immediately, only classification waits).
- **Timezone.** Relative dates are resolved in one configured time zone (`APP_TIMEZONE`).

## Production risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Account ban** from automating a personal WhatsApp number | Loss of the number | Listener is read-only (never sends); use a dedicated number; keep one session per number; consider WhatsApp's official channels where possible |
| **Privacy**: group messages and photos go to a third-party AI | Legal / trust issues | Group consent; data processing agreement with the provider; option to redact phone numbers and names before sending; retention policy for messages and images |
| **Session data in MongoDB** is equivalent to being logged in | Account takeover if the DB leaks | Encrypt at rest, restrict DB network access and users, separate DB user for the app |
| **Library breakage** after a WhatsApp Web update | Messages stop arriving | Pin the version; health check alerts when state is not `ready` or no message has been seen for N hours; backfill recovers the gap after the fix |
| **Chromium memory** (roughly 300–500 MB per session) | Crashes on small hosts | One container per account with memory limits and a health check; crash detection already restarts the client |
| **AI outage or quota exhaustion** | Classification stops | Messages are still captured as `pending`; retries with backoff; `failed` + Retry; could add a fallback model in the provider adapter |
| **Wrong AI result auto-approved** | A real incident is missed | Incidents / Change Requests / high priority always go to a person; tune the threshold using `review.changedFields`; alerting on Incidents |
| **Prompt injection** in messages | Manipulated classification | The prompt treats the message as data; output is schema-validated; the model has no tools or actions, so the worst case is a wrong label |
| **No authentication on the API/UI** | Anyone on the network can review or log out the device | Add login + roles before exposing it beyond localhost |

## Scale path

1. Run the listener and the worker as separate processes (they only share MongoDB already).
2. Move the queue to BullMQ/Redis for higher throughput and delayed jobs.
3. Store images in S3-compatible storage with signed URLs.
4. Add authentication, roles and an audit log for reviews.
5. Support several groups/accounts: `groupId` is already on every message; the selected group becomes a list, and each account gets its own session (`clientId`).
6. Use approved reviews as labelled data: measure accuracy per category, then improve the prompt (versioned) or fine-tune.
