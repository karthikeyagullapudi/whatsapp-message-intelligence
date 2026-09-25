import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppConnection } from '../../src/modules/whatsapp/whatsapp.client.js';

// Stand-in for whatsapp-web.js Client: no Chromium, we fire events by hand.
class FakeClient extends EventEmitter {
  constructor({ failInit = false } = {}) {
    super();
    this.failInit = failInit;
    this.destroyed = false;
    this.info = { wid: { _serialized: '919000000000@c.us' }, pushname: 'Tester' };
  }
  async initialize() {
    if (this.failInit) throw new Error('Chromium failed to launch');
  }
  async destroy() {
    this.destroyed = true;
  }
  async logout() {}
}

const logger = { info() {}, warn() {}, error() {} };

function setup(clientOptions = []) {
  const clients = [];
  const store = { delete: vi.fn(async () => {}) };
  const connection = new WhatsAppConnection({
    store,
    clientId: 'test',
    logger,
    createClient: () => {
      const client = new FakeClient(clientOptions[clients.length] ?? {});
      clients.push(client);
      return client;
    },
  });
  return { connection, clients, store };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('WhatsAppConnection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes qr → authenticated → ready', async () => {
    const { connection, clients } = setup();
    connection.start();
    await flush();

    clients[0].emit('qr', 'some-qr-string');
    // QR → PNG conversion is real async work, so wait for it.
    await vi.waitFor(() => expect(connection.getStatus()).toMatchObject({ state: 'qr' }));
    expect(connection.getStatus().qr).toMatch(/^data:image\/png;base64,/);

    clients[0].emit('authenticated');
    clients[0].emit('ready');
    await flush();
    expect(connection.getStatus()).toMatchObject({ state: 'ready', account: { name: 'Tester' } });
  });

  it('keeps the API alive when Chromium fails, and retries with growing backoff', async () => {
    const { connection, clients } = setup([{ failInit: true }, { failInit: true }, {}]);
    connection.start();
    await flush();

    expect(connection.getStatus()).toMatchObject({ state: 'error' });
    expect(connection.getStatus().lastError).toMatch(/Chromium failed/);

    await vi.advanceTimersByTimeAsync(5000); // 1st retry after 5s → fails again
    expect(clients).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(9999); // 2nd retry needs 10s
    expect(clients).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(3);
    expect(connection.getState()).toBe('initializing');
  });

  it('on disconnect: destroys the old client, reconnects with a new one, ignores stale events', async () => {
    const { connection, clients } = setup();
    connection.start();
    await flush();
    clients[0].emit('ready');
    await flush();

    clients[0].emit('disconnected', 'UNPAIRED');
    await flush();
    expect(connection.getStatus()).toMatchObject({ state: 'disconnected', lastError: 'Disconnected: UNPAIRED' });
    expect(clients[0].destroyed).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(clients).toHaveLength(2);

    // A late event from the dead client must not change anything.
    clients[0].emit('ready');
    await flush();
    expect(connection.getState()).toBe('initializing');
  });

  it('clears the saved session on auth failure', async () => {
    const { connection, clients, store } = setup();
    connection.start();
    await flush();
    clients[0].emit('auth_failure', 'bad session');
    await flush();
    expect(store.delete).toHaveBeenCalledWith({ session: 'RemoteAuth-test' });
    expect(connection.getState()).toBe('disconnected');
  });
});
