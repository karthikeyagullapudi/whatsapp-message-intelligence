import { EventEmitter } from 'node:events';
import QRCode from 'qrcode';
import wwebjs from 'whatsapp-web.js';
import { backoffDelay, withTimeout } from '../../utils/retry.js';

const { Client, RemoteAuth, Message } = wwebjs;

export const WA_STATES = Object.freeze({
  STOPPED: 'stopped',
  INITIALIZING: 'initializing', // launching Chromium, loading WhatsApp Web
  QR: 'qr', // waiting for the user to scan
  AUTHENTICATED: 'authenticated', // scanned / session restored, still loading chats
  READY: 'ready', // fully connected, messages flow
  DISCONNECTED: 'disconnected', // lost the session, reconnect scheduled
  ERROR: 'error', // could not start (e.g. Chromium failed), retry scheduled
});

const BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

// Owns the whatsapp-web.js Client and keeps it alive.
//
// Emits:
//   'state'   (status)  every time the connection status changes
//   'ready'             when WhatsApp is connected
//   'message' (msg)     every message_create event
//
// Reliability rules:
//  - Every failure (initialize error, disconnect, auth failure, Chromium crash)
//    goes through #restart(): destroy the old client, then create a NEW one after
//    an exponential backoff (5s, 10s, 20s … max 5 min). Backoff resets on 'ready'.
//  - Each client gets a "generation" number. When we restart, events still coming
//    from the old client are ignored, so a dying client cannot trigger a second
//    restart or overwrite the new client's state.
export class WhatsAppConnection extends EventEmitter {
  #client = null;
  #generation = 0;
  #attempt = 0;
  #reconnectTimer = null;
  #stopped = true;
  #status = {
    state: WA_STATES.STOPPED,
    qr: null, // data:image/png;base64,… ready for an <img>
    loadingPercent: null,
    waState: null, // WhatsApp Web's own state: CONNECTED, OPENING, TIMEOUT …
    lastError: null,
    nextRetryAt: null,
    readyAt: null,
    sessionSavedAt: null,
    account: null, // { id, name } of the linked phone
  };

  constructor({ store, clientId, dataPath, backupSyncMs, headless = true, executablePath, logger, createClient }) {
    super();
    this.store = store;
    this.clientId = clientId;
    this.sessionName = `RemoteAuth-${clientId}`;
    this.logger = logger;
    // Injectable so tests can pass a fake client instead of launching Chromium.
    this.createClient =
      createClient ??
      (() =>
        new Client({
          authStrategy: new RemoteAuth({ store, clientId, dataPath, backupSyncIntervalMs: backupSyncMs }),
          puppeteer: { headless, executablePath, args: BROWSER_ARGS },
        }));
  }

  getStatus() {
    return { ...this.#status };
  }

  getState() {
    return this.#status.state;
  }

  isReady() {
    return this.#status.state === WA_STATES.READY && this.#client !== null;
  }

  start() {
    this.#stopped = false;
    this.#connect();
  }

  async stop() {
    this.#stopped = true;
    clearTimeout(this.#reconnectTimer);
    this.#generation++;
    const client = this.#client;
    this.#client = null;
    await this.#safeDestroy(client);
    this.#setStatus({ state: WA_STATES.STOPPED, qr: null, nextRetryAt: null });
  }

  // Unlinks the device and deletes the saved session, then starts fresh (new QR).
  async logout() {
    clearTimeout(this.#reconnectTimer);
    this.#generation++; // ignore the 'disconnected' event logout itself triggers
    const client = this.#client;
    this.#client = null;

    if (client) {
      try {
        await withTimeout(client.logout(), 20000, 'WhatsApp logout');
      } catch (err) {
        this.logger.warn({ err: err.message }, 'Logout did not finish cleanly, deleting session manually');
        await this.store.delete({ session: this.sessionName }).catch(() => {});
      }
      await this.#safeDestroy(client);
    }

    this.#attempt = 0;
    this.#setStatus({ account: null, sessionSavedAt: null, lastError: null });
    if (!this.#stopped) this.#connect();
  }

  // Lists the groups this account is in.
  //
  // We do NOT use client.getChats(): it fully serializes every chat and fetches
  // each group's participants from WhatsApp's servers inside one Promise.all, so a
  // single odd chat (a left group, a Community, a changed WhatsApp Web internal)
  // makes the whole call fail. Here we read only id/name/size from WhatsApp Web's
  // in-memory chat list, with a try/catch per chat.
  async getGroups() {
    const page = this.#requireClient().pupPage;
    const groups = await withTimeout(
      page.evaluate(() => {
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        const result = [];
        for (const chat of chats) {
          try {
            const id = chat.id?._serialized;
            if (!id || !id.endsWith('@g.us')) continue;
            result.push({
              id,
              name: chat.formattedTitle || chat.name || chat.groupMetadata?.subject || id,
              participants: chat.groupMetadata?.participants?.length ?? null,
            });
          } catch {
            // skip a chat we cannot read, never fail the whole list
          }
        }
        return result;
      }),
      30000,
      'list groups',
    );
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Last `limit` messages of a chat, oldest first, as whatsapp-web.js Message
  // objects (so downloadMedia() etc. work). Same steps as Chat.fetchMessages(),
  // minus client.getChatById(), which goes through the fragile serializer above.
  async fetchRecentMessages(chatId, limit) {
    const client = this.#requireClient();
    const models = await withTimeout(
      client.pupPage.evaluate(
        async (chatId, limit) => {
          const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
          if (!chat) return null;
          const keep = (m) => !m.isNotification;
          let msgs = chat.msgs.getModelsArray().filter(keep);
          while (msgs.length < limit) {
            const earlier = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
            if (!earlier || !earlier.length) break;
            msgs = [...earlier.filter(keep), ...msgs];
          }
          msgs.sort((a, b) => a.t - b.t);
          return msgs.slice(-limit).map((m) => window.WWebJS.getMessageModel(m));
        },
        chatId,
        limit,
      ),
      60000,
      'fetch recent messages',
    );
    if (models === null) throw new Error(`Chat ${chatId} not found on this account`);
    return models.map((m) => new Message(client, m));
  }

  #requireClient() {
    if (!this.isReady()) throw new Error(`WhatsApp is not ready (state: ${this.#status.state})`);
    return this.#client;
  }

  async #connect() {
    clearTimeout(this.#reconnectTimer);
    const gen = ++this.#generation;
    this.#setStatus({ state: WA_STATES.INITIALIZING, qr: null, loadingPercent: null, nextRetryAt: null });

    let client;
    try {
      client = this.createClient();
      this.#client = client;
      this.#bindEvents(client, gen);
      await client.initialize();
    } catch (err) {
      // Chromium missing/crashed, network down while loading WhatsApp Web, etc.
      // The API keeps running; we show the error and try again later.
      this.logger.error({ err: err.message }, 'WhatsApp client failed to initialize');
      await this.#restart(gen, `Failed to start WhatsApp Web: ${err.message}`, WA_STATES.ERROR);
    }
  }

  #bindEvents(client, gen) {
    // Only react to events from the current client.
    const on = (event, handler) =>
      client.on(event, async (...args) => {
        if (gen !== this.#generation) return;
        try {
          await handler(...args);
        } catch (err) {
          this.logger.error({ err, event }, 'Error in WhatsApp event handler');
        }
      });

    on('qr', async (qr) => {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
      this.#setStatus({ state: WA_STATES.QR, qr: dataUrl, loadingPercent: null });
      this.logger.info('WhatsApp QR code received, waiting for scan');
    });

    on('loading_screen', (percent) => this.#setStatus({ loadingPercent: Number(percent) || null }));

    on('authenticated', () => {
      this.#setStatus({ state: WA_STATES.AUTHENTICATED, qr: null });
      this.logger.info('WhatsApp authenticated');
    });

    on('auth_failure', async (message) => {
      // Saved session is invalid: delete it so the next start shows a fresh QR.
      this.logger.warn({ message }, 'WhatsApp authentication failed, clearing saved session');
      await this.store.delete({ session: this.sessionName }).catch(() => {});
      await this.#restart(gen, `Authentication failed: ${message}`, WA_STATES.DISCONNECTED);
    });

    on('ready', () => {
      this.#attempt = 0;
      const info = client.info;
      this.#setStatus({
        state: WA_STATES.READY,
        qr: null,
        loadingPercent: null,
        lastError: null,
        nextRetryAt: null,
        readyAt: new Date(),
        account: info ? { id: info.wid?._serialized, name: info.pushname } : null,
      });
      this.logger.info({ account: info?.pushname }, 'WhatsApp ready');

      // whatsapp-web.js does not notice if Chromium itself dies, so we watch it.
      client.pupBrowser?.once('disconnected', () =>
        this.#restart(gen, 'Browser closed unexpectedly', WA_STATES.DISCONNECTED),
      );

      this.emit('ready');
    });

    // Short network problems show up here as OPENING / TIMEOUT; WhatsApp Web
    // reconnects by itself, we only display it.
    on('change_state', (waState) => this.#setStatus({ waState }));

    on('remote_session_saved', () => {
      this.#setStatus({ sessionSavedAt: new Date() });
      this.logger.info('WhatsApp session backed up to MongoDB');
    });

    // Fires for messages from others AND for messages sent from the linked phone.
    on('message_create', (msg) => this.emit('message', msg));

    // Logged out from the phone, session conflict, account blocked …
    on('disconnected', (reason) => {
      this.logger.warn({ reason }, 'WhatsApp disconnected');
      return this.#restart(gen, `Disconnected: ${reason}`, WA_STATES.DISCONNECTED);
    });
  }

  async #restart(gen, reason, state) {
    if (gen !== this.#generation || this.#stopped) return;
    this.#generation++; // silence the old client from here on

    const old = this.#client;
    this.#client = null;
    await this.#safeDestroy(old);

    const delay = backoffDelay(this.#attempt++, { base: 5000, max: 5 * 60 * 1000 });
    this.#setStatus({ state, lastError: reason, qr: null, nextRetryAt: new Date(Date.now() + delay) });
    this.logger.info({ delayMs: delay, attempt: this.#attempt }, 'WhatsApp reconnect scheduled');
    this.#reconnectTimer = setTimeout(() => this.#connect(), delay);
  }

  async #safeDestroy(client) {
    if (!client) return;
    client.removeAllListeners();
    try {
      await withTimeout(client.destroy(), 15000, 'client.destroy');
    } catch (err) {
      this.logger.warn({ err: err.message }, 'Failed to destroy WhatsApp client cleanly');
    }
  }

  #setStatus(patch) {
    this.#status = { ...this.#status, ...patch };
    this.emit('state', this.getStatus());
  }
}
