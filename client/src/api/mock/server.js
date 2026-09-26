import { mockBus } from './bus.js';
import { buildFixtures, GROUP, GROUPS, INCOMING, ai, msg } from './fixtures.js';
import { fakeQr } from './images.js';

// In-browser fake of the Express API for VITE_MOCK=1. Same paths, same shapes,
// same error format, and it emits the same socket events.

const CATEGORIES = ['Incident', 'Change Request', 'Question', 'Resource Update', 'Routine Update', 'Irrelevant'];
const PRIORITIES = ['low', 'medium', 'high'];
const REVIEWABLE = ['needs_review', 'auto_approved', 'approved', 'failed'];

let messages = buildFixtures();
let wa = {
  state: 'ready',
  qr: null,
  loadingPercent: null,
  waState: 'CONNECTED',
  lastError: null,
  nextRetryAt: null,
  readyAt: new Date().toISOString(),
  sessionSavedAt: new Date(Date.now() - 3600000).toISOString(),
  account: { id: '919059500000@c.us', name: 'Site Office' },
  selectedGroup: { id: GROUP.id, name: GROUP.name },
};

const clone = (v) => structuredClone(v);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const later = (ms, fn) => setTimeout(fn, ms);

function fail(status, code, message, details) {
  throw Object.assign(new Error(message), { status, code, details });
}

function setWa(patch) {
  wa = { ...wa, ...patch };
  mockBus.emit('wa:state', clone(wa));
}

function update(id, patch) {
  const i = messages.findIndex((m) => m._id === id);
  if (i === -1) return null;
  messages[i] = { ...messages[i], ...patch, updatedAt: new Date().toISOString() };
  mockBus.emit('message:updated', clone(messages[i]));
  return messages[i];
}

const finalCategory = (m) => m.review?.category ?? m.ai?.category;

function list({ groupId, status, category, q, page = '1', limit = '20', sort = 'newest' }) {
  let items = messages.filter(
    (m) =>
      (!groupId || m.groupId === groupId) &&
      (!status || m.processing.status === status) &&
      (!category || finalCategory(m) === category) &&
      (!q || [m.body, m.senderName, m.ai?.summary, m.review?.summary].some((t) => t?.toLowerCase().includes(q.toLowerCase()))),
  );
  items.sort((a, b) => (sort === 'oldest' ? 1 : -1) * (new Date(a.timestamp) - new Date(b.timestamp)));
  const p = Number(page);
  const l = Number(limit);
  return { items: clone(items.slice((p - 1) * l, p * l)), total: items.length, page: p, limit: l, pages: Math.max(1, Math.ceil(items.length / l)) };
}

function review(id, body) {
  const m = messages.find((x) => x._id === id);
  if (!m) fail(404, 'NOT_FOUND', 'Message not found');
  const details = [];
  if (!CATEGORIES.includes(body?.category)) details.push({ path: 'body.category', message: 'Invalid option' });
  if (!body?.summary?.trim()) details.push({ path: 'body.summary', message: 'summary is required' });
  if (!PRIORITIES.includes(body?.priority)) details.push({ path: 'body.priority', message: 'Invalid option' });
  if (details.length) fail(400, 'BAD_REQUEST', 'Invalid request body', details);
  if (!REVIEWABLE.includes(m.processing.status)) fail(409, 'CONFLICT', `Message cannot be reviewed while it is '${m.processing.status}'`);
  const fields = ['category', 'summary', 'priority', 'actionRequired', 'entities'];
  const changedFields = fields.filter((f) => JSON.stringify(m.ai?.[f] ?? null) !== JSON.stringify(body[f] ?? null));
  return update(id, {
    review: { ...body, notes: body.notes ?? '', reviewedBy: body.reviewedBy ?? 'reviewer', reviewedAt: new Date().toISOString(), changedFields },
    processing: { ...m.processing, status: 'approved' },
  });
}

// Runs a message through pending → processing → classified, like the worker.
function simulateWorker(id, { category, confidence } = {}) {
  later(1200, () => {
    const m = messages.find((x) => x._id === id);
    if (!m || m.processing.status !== 'pending') return;
    update(id, { processing: { ...m.processing, status: 'processing', attempts: m.processing.attempts + 1 } });
    later(1800, () => {
      const cur = messages.find((x) => x._id === id);
      const cat = category ?? cur.ai?.category ?? 'Routine Update';
      const result = ai(cat, confidence ?? 0.9, { summary: cur.body.slice(0, 120) || 'Image message.', reasoning: 'Mock classification.' });
      update(id, { ai: result, processing: { ...cur.processing, status: result.reviewReasons.length ? 'needs_review' : 'auto_approved', lastError: null } });
    });
  });
}

function retry(id) {
  const m = messages.find((x) => x._id === id);
  if (!m) fail(404, 'NOT_FOUND', 'Message not found');
  if (m.processing.status !== 'failed') fail(409, 'CONFLICT', 'Only failed messages can be retried');
  const updated = update(id, { processing: { ...m.processing, status: 'pending', attempts: 0, lastError: null } });
  simulateWorker(id, { category: /crane|scaffold/i.test(m.body) ? 'Incident' : undefined, confidence: 0.9 });
  return updated;
}

function stats({ groupId } = {}) {
  return messages.filter((m) => !groupId || m.groupId === groupId).reduce((acc, m) => ({ ...acc, [m.processing.status]: (acc[m.processing.status] ?? 0) + 1 }), {});
}

// Connection flow after logout: initializing → qr → authenticated → ready.
function simulateLogin() {
  setWa({ state: 'initializing', qr: null, account: null, selectedGroup: null, sessionSavedAt: null, loadingPercent: null });
  later(1200, () => setWa({ state: 'qr', qr: fakeQr(Date.now() % 1000) }));
  later(7000, () => setWa({ qr: fakeQr((Date.now() + 7) % 1000) })); // QR refresh
  later(12000, () => setWa({ state: 'authenticated', qr: null, loadingPercent: 20 }));
  later(13500, () => setWa({ loadingPercent: 70 }));
  later(15000, () =>
    setWa({ state: 'ready', loadingPercent: null, readyAt: new Date().toISOString(), account: { id: '919059500000@c.us', name: 'Site Office' } }),
  );
  later(75000, () => setWa({ sessionSavedAt: new Date().toISOString() }));
}

// Dev helpers exposed in the command palette (mock only).
export const mockControls = {
  simulateDisconnect() {
    setWa({ state: 'disconnected', lastError: 'Disconnected: CONFLICT', nextRetryAt: new Date(Date.now() + 10000).toISOString() });
    later(10000, () => setWa({ state: 'initializing', lastError: null, nextRetryAt: null }));
    later(12500, () => setWa({ state: 'ready', readyAt: new Date().toISOString() }));
  },
  toggleSocket() {
    mockBus.setConnected(!mockBus.connected);
  },
  receiveMessage,
};

let incoming = 0;
function receiveMessage() {
  const [who, body, category, confidence] = INCOMING[incoming++ % INCOMING.length];
  const m = msg(who, 0, body, { status: 'pending' });
  messages.unshift(m);
  mockBus.emit('message:new', { _id: m._id, waMessageId: m.waMessageId, senderName: m.senderName, type: m.type, body, timestamp: m.timestamp, status: 'pending' });
  simulateWorker(m._id, { category, confidence });
}
setInterval(receiveMessage, 45000);

export async function mockRequest(method, path, body) {
  await delay(120 + Math.random() * 180);
  const [pathname, search = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const parts = pathname.split('/').filter(Boolean); // e.g. ['messages', ':id', 'review']

  if (pathname === '/health') return { ok: true, db: 'up', whatsapp: wa.state, ai: { status: 'running', model: 'mock', running: true } };
  if (pathname === '/whatsapp/status') return clone(wa);
  if (pathname === '/whatsapp/groups') {
    if (wa.state !== 'ready') fail(503, 'SERVICE_UNAVAILABLE', `WhatsApp is not connected yet (state: ${wa.state})`);
    return { groups: clone(GROUPS) };
  }
  if (pathname === '/whatsapp/group' && method === 'PUT') {
    const g = GROUPS.find((x) => x.id === body?.groupId);
    if (!g) fail(404, 'NOT_FOUND', 'This WhatsApp account is not a member of that group');
    setWa({ selectedGroup: { id: g.id, name: g.name } });
    return { selectedGroup: { id: g.id, name: g.name } };
  }
  if (pathname === '/whatsapp/logout' && method === 'POST') {
    simulateLogin();
    return clone(wa);
  }

  if (parts[0] === 'messages') {
    if (parts.length === 1) return list(query);
    if (parts[1] === 'stats') return stats(query);
    const id = parts[1];
    if (parts.length === 2) {
      const m = messages.find((x) => x._id === id);
      if (!m) fail(404, 'NOT_FOUND', 'Message not found');
      return clone(m);
    }
    if (parts[2] === 'review' && method === 'PATCH') return clone(review(id, body));
    if (parts[2] === 'retry' && method === 'POST') return clone(retry(id));
  }

  return fail(404, 'NOT_FOUND', `Route not found: ${method} /api${path}`);
}
