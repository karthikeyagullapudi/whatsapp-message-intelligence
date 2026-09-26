# WhatsApp integration

The brief requires WhatsApp Web and rules out the WhatsApp Business API. I used **[whatsapp-web.js](https://docs.wwebjs.dev/)**, a library that runs the real WhatsApp Web in a hidden Chrome browser. The app connects exactly like opening web.whatsapp.com on a laptop: it becomes a "linked device" on the user's phone.

| Option | Why it was not chosen |
| --- | --- |
| WhatsApp Business API | Not allowed by the brief, and it cannot read regular groups |
| [Baileys](https://github.com/whiskeysockets/Baileys) | Lighter (no browser), but it reimplements WhatsApp's protocol instead of using WhatsApp Web. A good option to consider for production if memory use matters |

## Logging in and staying logged in

- **Login:** WhatsApp Web shows a QR code. The app turns it into an image and shows it on the **Connection** page. The user scans it from WhatsApp → Linked devices.
- **Staying logged in:** about a minute after login, the login data is saved to MongoDB, and it is refreshed every 5 minutes. When the server restarts, the login is restored automatically, so **no new QR code is needed** (reconnection takes about 10 seconds). The Connection page shows when the session was last saved.
- **Invalid login:** if WhatsApp rejects the saved login, it is deleted and a fresh QR code is shown.
- **Logout:** unlinks the device, deletes the saved login, and clears the selected group.

The common package for saving sessions in MongoDB (`wwebjs-mongo`) turned out to be incompatible with the current library version: it looked for the saved file in the wrong folder, so logins were never actually saved. I replaced it with a small, custom session store ([whatsapp.sessionStore.js](../server/src/modules/whatsapp/whatsapp.sessionStore.js)).

## Listening to one group

- The Connection page lists the account's groups. The chosen group is saved, so it survives restarts.
- Every incoming message is checked: messages from any other chat are ignored.
- Messages sent by the connected account itself are also captured.
- System notices such as "X added Y" are ignored. Unsupported types (video, voice notes, documents) are stored as "unsupported", so nothing disappears silently.

## What is captured

For each message: **text (or image caption), sender, group, time**, the message type, and a copy of the original data for auditing.

**Images** are downloaded and stored on disk, named by their content, so the same photo is only stored once. If a download fails, the message is still saved with its caption and marked for review.

## Duplicates

| Type | Example | What happens |
| --- | --- | --- |
| **Exact duplicate** | WhatsApp delivers the same message twice, or it is seen again after a reconnect | The message's unique id is enforced by the database, so it is only ever stored once, even if both copies arrive at the same moment (covered by a test) |
| **Repeated post** | The same person sends the same text or photo again within 10 minutes | It is stored and visible, but marked as a duplicate and **not** sent to the AI again |

## Handling connection problems

| Situation | What the app does |
| --- | --- |
| Phone offline or internet drops briefly | WhatsApp Web reconnects on its own; the app shows the status |
| Logged out from the phone, or another session takes over | The app starts a new connection (with a new QR code if needed) |
| The browser fails to start or crashes | The error is shown and the app retries automatically; the rest of the app keeps working |
| Saved login is no longer valid | The saved login is deleted and a new QR code is shown |

Retries wait longer after each failure: 5 seconds, 10, 20, and so on, up to 5 minutes. This avoids hammering WhatsApp when something is wrong.

**Recovering missed messages:** every time the connection comes back, the app reads the **last 50 messages** of the group. Any that were sent while the app was offline are saved; ones already stored are skipped.

## Issues found while testing with a real account

Because whatsapp-web.js is unofficial and depends on WhatsApp Web's internals, I tested against a real account and group, not only with automated tests. This uncovered four problems, all fixed:

1. **Group list failed on a large account.** The library's method loads full details for every chat at once, and one unusual chat broke the whole list. The app now reads only the name and id of each group, which is both faster (145 groups in about 30 ms) and no longer breaks on one bad chat.
2. **Recovering missed messages used the same fragile method.** Replaced in the same way.
3. **Messages were being silently dropped.** With WhatsApp's newer user ids, the library lost the message id. The first message was saved without an id, and every later message then looked like a duplicate of it. The app now builds its own reliable id and refuses to save a message without one. After the fix, the missed messages were recovered automatically on reconnect.
4. **Image downloads failed** for the same reason. The missing id is now restored before downloading.

Fixes 3 and 4 are covered by automated tests. Fixes 1 and 2 run inside the WhatsApp Web page, so they were verified on the real account.
