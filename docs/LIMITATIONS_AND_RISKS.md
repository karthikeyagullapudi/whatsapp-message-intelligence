# Known limitations and production risks

## Known limitations

The biggest one is that whatsapp-web.js is unofficial. It works by controlling WhatsApp Web, so a change to WhatsApp's website can break it until the library catches up. I already ran into four such issues while testing and worked around them (see [WHATSAPP_INTEGRATION.md](WHATSAPP_INTEGRATION.md)).

Beyond that, this is deliberately a small version of the system:

- It listens to one group from one WhatsApp account.
- The review screen has no login, so anyone who can open the web app can review messages or disconnect WhatsApp. Reviews are saved under a default reviewer name.
- Only text and images are analysed. Voice notes, videos, documents and polls are stored but skipped. Edits and deletions on WhatsApp are not tracked, and a reply is analysed without the message it replies to.
- After downtime the app re-reads the last 50 group messages. In a busy group, a long outage could still miss older ones (the number is configurable).
- The first backup of the WhatsApp login happens about a minute after scanning, so restarting within that minute means scanning again.
- Images are kept on the server's disk rather than in cloud storage.
- Dates like "tomorrow" are read in one time zone (India by default).

On the AI side, the model's confidence score is not fully reliable, and my accuracy test uses only 20 messages. Each message is also judged on its own, without the conversation around it, so short replies like "done" or "same here" have little context. Classification is capped at 10 requests a minute to stay within the free tier; messages are still saved immediately, only the analysis waits.

## Production risks and how to reduce them

| Risk | Impact | How to reduce it |
| --- | --- | --- |
| **The WhatsApp number could be banned** for automation | Loss of the number | The app only reads and never sends messages. Use a dedicated number, not a personal one |
| **Privacy:** group messages and photos are sent to an external AI service | Legal and trust concerns | Get the group's consent, sign a data agreement with the provider, remove names and phone numbers before sending, and set a data retention policy |
| **The saved WhatsApp login gives access to the account** | Account takeover if the database is exposed | Encrypt the database, restrict who can access it, and use a separate database user for the app |
| **A WhatsApp update breaks the library** | New messages stop arriving | Pin the library version, alert when the connection is down or no messages arrive for a while. Missed messages are recovered once it is fixed |
| **The hidden browser uses a lot of memory** (about 300–500 MB) | Crashes on small servers | Run it in its own container with a memory limit and a health check. The app already restarts the browser if it crashes |
| **The AI service is down or out of quota** | Messages are not classified | Messages are still saved and retried automatically. A second AI provider could be added as a fallback |
| **A wrong AI result is auto-approved** | A real incident could be missed | Incidents, change requests and high-priority messages always go to a person. The threshold can be tuned using reviewer corrections |
| **A message tries to manipulate the AI** | Wrong classification | The AI is told to treat messages as information only, its answer is strictly checked, and it cannot take any actions |
| **No authentication** | Anyone with access can review or disconnect | Add login and user roles before making the app available beyond a private network |

## How it would scale

1. **Split into separate services:** run the WhatsApp listener and the AI worker independently (they already only share the database).
2. **Use a dedicated job queue** (such as Redis with BullMQ) for higher volume.
3. **Store images in cloud storage** (such as Amazon S3).
4. **Add authentication,** user roles and an audit log of reviews.
5. **Support multiple groups and accounts:** each message already records its group, so this mainly means allowing several selected groups and one saved login per account.
6. **Improve accuracy with real data:** use reviewer corrections to measure accuracy per category and refine the instructions to the AI.
