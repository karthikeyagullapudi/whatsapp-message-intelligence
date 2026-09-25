// Builds objects shaped like whatsapp-web.js Message instances.
export const GROUP_ID = '120363000000000001@g.us';
export const OTHER_GROUP_ID = '120363000000000999@g.us';
export const ME = '919000000000@c.us';
export const RAVI = '919111111111@c.us';

let counter = 0;

export function fakeMessage(overrides = {}) {
  counter += 1;
  const fromMe = overrides.fromMe ?? false;
  const chatId = overrides.chatId ?? GROUP_ID;
  return {
    id: { _serialized: overrides.id ?? `false_${chatId}_MSG${counter}_${RAVI}` },
    type: 'chat',
    body: 'Pump 3 at Block B is leaking',
    timestamp: 1790000000 + counter,
    from: fromMe ? ME : chatId,
    to: fromMe ? chatId : ME,
    author: fromMe ? undefined : RAVI,
    fromMe,
    hasMedia: false,
    _data: { notifyName: 'Ravi' },
    getContact: async () => ({ pushname: 'Ravi' }),
    downloadMedia: async () => null,
    ...overrides,
  };
}

// 1×1 transparent PNG
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
