import { normalizeText, sha256 } from '../../utils/hash.js';

// Pure functions only: WhatsApp Message object in → plain data out.
// No network, no database, which makes them trivial to unit test.

// WhatsApp type → our type. Everything else is stored as 'unsupported'.
const SUPPORTED_TYPES = { chat: 'text', image: 'image' };

// System events that show up in a group chat but are not messages
// ("X added Y", encryption notices, deleted-message protocol events …).
const IGNORED_TYPES = new Set([
  'e2e_notification',
  'notification',
  'notification_template',
  'gp2',
  'protocol',
  'call_log',
  'revoked',
]);

const serialize = (wid) => (wid && typeof wid === 'object' ? wid._serialized : wid) || null;

// Stable dedupe key for a message: "<chatId>_<messageId>".
//
// We do NOT use msg.id._serialized: with WhatsApp's newer "LID" ids the library
// rebuilds msg.id as a plain object and _serialized is lost (it came back null
// on real messages). The chat id + WhatsApp's own message id are always present
// and unique, and they are the same whether the message arrives live or via backfill.
export function getWaMessageId(msg) {
  const remote = serialize(msg.id?.remote) ?? getChatId(msg);
  const key = msg.id?.id;
  if (!remote || !key) throw new Error('Message has no usable id, refusing to store it');
  return `${remote}_${key}`;
}

// whatsapp-web.js methods such as msg.downloadMedia() look the message up by
// msg.id._serialized. When the library lost it (see above) they fail with a
// cryptic error, so we rebuild it in WhatsApp's own key format:
// "<fromMe>_<chatId>_<messageId>[_<participant>]".
export function ensureSerializedId(msg) {
  if (!msg.id || msg.id._serialized) return msg;
  const parts = [String(Boolean(msg.id.fromMe)), serialize(msg.id.remote), msg.id.id];
  const participant = serialize(msg.id.participant);
  if (participant) parts.push(participant);
  msg.id._serialized = parts.join('_');
  return msg;
}

// For our own messages `from` is our number and `to` is the chat;
// for everyone else's, `from` is the chat.
export function getChatId(msg) {
  return msg.fromMe ? msg.to : msg.from;
}

export function isFromGroup(msg, groupId) {
  return Boolean(groupId) && getChatId(msg) === groupId;
}

export function shouldIgnore(msg) {
  return IGNORED_TYPES.has(msg.type) || Boolean(msg.isStatus);
}

export function mapMessageType(waType) {
  return SUPPORTED_TYPES[waType] ?? 'unsupported';
}

// In a group, `author` is the person who sent it. It can be missing on our own
// messages, in which case `from` is our own id.
export function getSenderId(msg) {
  return msg.author || msg.from;
}

// Small, JSON-safe copy of the original payload, kept for auditing/debugging.
export function pickRaw(msg) {
  return {
    id: msg.id ? { ...msg.id, remote: serialize(msg.id.remote), participant: serialize(msg.id.participant) } : null,
    type: msg.type,
    from: msg.from,
    to: msg.to,
    author: msg.author ?? null,
    fromMe: Boolean(msg.fromMe),
    timestamp: msg.timestamp,
    hasMedia: Boolean(msg.hasMedia),
    isForwarded: Boolean(msg.isForwarded),
    hasQuotedMsg: Boolean(msg.hasQuotedMsg),
    mentionedIds: msg.mentionedIds ?? [],
  };
}

export function mapMessage(msg, { groupName = null, senderName = null, source = 'live' } = {}) {
  const type = mapMessageType(msg.type);
  const unsupported = type === 'unsupported';

  return {
    waMessageId: getWaMessageId(msg),
    groupId: getChatId(msg),
    groupName,
    senderId: getSenderId(msg),
    senderName: senderName || msg._data?.notifyName || null,
    fromMe: Boolean(msg.fromMe),
    timestamp: new Date(msg.timestamp * 1000),
    type,
    waType: msg.type,
    body: msg.body ?? '',
    raw: pickRaw(msg),
    source,
    processing: {
      status: unsupported ? 'skipped' : 'pending',
      skipReason: unsupported ? 'unsupported_type' : null,
      attempts: 0,
      nextRunAt: new Date(),
    },
  };
}

// Fingerprint used to spot "same person posted the same thing again".
// Text → normalized text. Image → the image bytes' hash (caption ignored).
// Returns null when there is nothing meaningful to compare.
export function computeContentHash({ senderId, type, body, mediaSha256 }) {
  let content = null;
  if (type === 'image' && mediaSha256) content = `img:${mediaSha256}`;
  else if (type === 'text' && normalizeText(body)) content = `txt:${normalizeText(body)}`;
  if (!content) return null;
  return sha256(`${senderId}|${content}`);
}
