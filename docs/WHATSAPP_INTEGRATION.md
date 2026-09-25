# WhatsApp integration

## Choice: whatsapp-web.js with RemoteAuth

The brief requires WhatsApp Web and rules out the Business API. [whatsapp-web.js](https://docs.wwebjs.dev/) runs the real web.whatsapp.com in headless Chromium (Puppeteer) and exposes its events, so the app is literally a WhatsApp Web session linked as a device.

| Option | Why not chosen |
| --- | --- |
| WhatsApp Business / Cloud API | Not allowed by the brief; also cannot read normal groups |
| [Baileys](https://github.com/whiskeysockets/Baileys) | Lighter (no browser, speaks the WebSocket protocol directly), but it re-implements the protocol instead of using WhatsApp Web, and is harder to explain and debug. A good production alternative if memory matters |

## Authentication and persistent session

- `new Client({ authStrategy: new RemoteAuth({ store, clientId: 'main', backupSyncIntervalMs: 300000 }) })`
- On `qr`, the QR string is converted to a PNG data URL and pushed to the Connect page over Socket.IO.
- About 60 s after the first login, RemoteAuth zips the Chromium profile and our `MongoSessionStore` saves it to **MongoDB GridFS** (`remote_session_saved`); after that it is refreshed every 5 minutes.
- On restart, the zip is restored before Chromium starts, so WhatsApp opens already logged in (about 10 s, no QR).
- `auth_failure` → the stored session is deleted and a new QR is shown.
- `POST /api/whatsapp/logout` → `client.logout()` unlinks the device and deletes the stored session, then a fresh client shows a new QR. The selected group is cleared because it belongs to the old account.

### Why a custom session store

The usual package, `wwebjs-mongo`, does not work with whatsapp-web.js 1.34: RemoteAuth writes the zip to its `dataPath` (`.wwebjs_auth/`), but `wwebjs-mongo` reads it from the current working directory, so every backup fails and the session never survives a restart. It also does not await deletes. [`whatsapp.sessionStore.js`](../server/src/modules/whatsapp/whatsapp.sessionStore.js) is the same GridFS idea in about 40 lines, with the correct path, `stream.pipeline` error handling, and only the newest backup kept.

## Listening to one group

- `GET /api/whatsapp/groups` lists the account's groups; the chosen id (`…@g.us`) is saved in `settings` and kept in memory.
- The listener uses `message_create`, which fires for everyone's messages **and** the linked user's own messages. For own messages `from` is the user and `to` is the group, so `getChatId()` uses `to` when `fromMe`.
- Group system events (`gp2` "X added Y", `e2e_notification`, `protocol`, …) are ignored. Other non-text/image types (video, voice, documents) are stored as `unsupported` / `skipped`, so nothing disappears silently.

## Capture

Each message is mapped by the pure function `mapMessage()` to: `waMessageId`, `groupId`, `groupName`, `senderId`, `senderName` (push name, falling back to the contact), `timestamp`, `type`, `waType`, `body` (text or caption), `raw` (trimmed payload) and `source` (`live` or `backfill`).

Images: `msg.downloadMedia()` (30 s timeout) → `storage/media/<sha256>.<ext>`. Naming files by content hash stores identical images once. If the download fails, the message is still saved with its caption and `media.error`, and it is still classified; the review rules flag it.

## Duplicates

| Kind | Example | Handling |
| --- | --- | --- |
| Hard | The same message delivered twice, or seen again during backfill | Cheap `exists` check first (to avoid re-downloading images), then `updateOne({ waMessageId }, { $setOnInsert: doc }, { upsert: true })` on a unique index. A concurrent second insert is a no-op, and an `E11000` race is treated as a duplicate. The test sends the same message 3× in parallel and gets 1 document |
| Soft | The same person posts the same text (ignoring case/spaces) or the same image again within 10 minutes | `contentHash = sha256(senderId + normalized text or image hash)`. Stored and visible with `duplicateOf`, status `skipped`, and **not** sent to the AI again |

## Connection failures

`WhatsAppConnection` ([whatsapp.client.js](../server/src/modules/whatsapp/whatsapp.client.js)) owns the client and exposes one status object: `initializing → qr → authenticated → ready`, or `disconnected` / `error` with `lastError` and `nextRetryAt`. Every change is pushed to the UI and saved to `settings`.

| What happens | Handling |
| --- | --- |
| Phone offline, Wi-Fi drop | WhatsApp Web reports `OPENING` / `TIMEOUT` and reconnects itself; we show it (`waState`) |
| Logged out from phone, session conflict (`disconnected`) | Destroy the client, create a **new** one after backoff → new QR if needed |
| Chromium fails to launch | `initialize()` error is caught → state `error`, retry with backoff; the API keeps running |
| Chromium crashes after start | whatsapp-web.js does not notice, so we listen to the browser's `disconnected` event and restart |
| Invalid stored session | `auth_failure` → delete the session → new QR |

Backoff is 5 s, 10 s, 20 s … capped at 5 minutes, and resets on `ready`.

**Generation guard:** every client gets a generation number. After a restart, late events from the old, dying client (e.g. a second `disconnected` or a late `ready`) are ignored. Without this, one failure could trigger two restarts, or an old client could overwrite the new client's state. This is covered by a unit test with a fake client.

**Backfill:** on every `ready`, the last `WA_BACKFILL_LIMIT` (50) messages of the selected group are fetched and passed through the same listener. Already-stored ones are skipped by the unique id, so messages sent while the server was down are recovered and repeating it is harmless.

**Graceful shutdown:** SIGINT/SIGTERM → stop the AI worker (finish in-flight jobs) → destroy the WhatsApp client → close sockets → close MongoDB.

## Library issues found on real data, and the fixes

The library is unofficial and depends on WhatsApp Web internals, so the integration was tested against a real account and group, not only with unit tests. Four problems were found and fixed:

1. **`client.getChats()` failed** on a real account with 145 groups: it serializes every chat and fetches each group's participants inside one `Promise.all`, so one unusual chat breaks the whole list. `getGroups()` now reads only id/name/size from WhatsApp Web's in-memory chat list, with a try/catch per chat (145 groups in about 30 ms).
2. **Backfill used `client.getChatById()`**, which goes through the same fragile serializer. `fetchRecentMessages()` does the same steps as `Chat.fetchMessages()` without it.
3. **`msg.id._serialized` was `null`** for messages with WhatsApp's newer LID user ids; the library rebuilds the id object and loses it. The first such message was stored with a null id, and because of the unique index **every later message was treated as a duplicate and dropped**. `waMessageId` is now built from parts that are always present (`<chatId>_<message id>`, identical for live and backfill), and a message without a usable id is refused. After the fix, the backfill recovered the 6 dropped messages.
4. **Image downloads failed** with a minified error (`"r"`) for the same reason: `downloadMedia()` looks the message up by `_serialized`. We now restore it in WhatsApp's own key format before downloading.

Fixes 3 and 4 have regression tests (`whatsapp.mapper.test.js`, `dedupe.test.js`). Fixes 1 and 2 run inside the WhatsApp Web page, so they were verified against the live account rather than with unit tests.
