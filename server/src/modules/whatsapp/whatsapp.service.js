import { AppError } from '../../utils/AppError.js';

// Business logic around the WhatsApp connection: which group we listen to,
// status for the UI, group listing, logout and backfill after reconnect.
export function createWhatsAppService({ connection, listener, Settings, emit = () => {}, logger, backfillLimit = 50 }) {
  let selectedGroup = null; // { id, name } kept in memory for the hot path
  let lastPersisted = null;

  function getStatus() {
    return { ...connection.getStatus(), selectedGroup };
  }

  // Errors from inside WhatsApp Web become a 502 with the real reason, so the UI
  // shows something useful instead of "Something went wrong".
  async function callWhatsApp(label, fn) {
    try {
      return await fn();
    } catch (err) {
      logger.error({ err: err.message }, `WhatsApp call failed: ${label}`);
      throw AppError.badGateway(`WhatsApp could not ${label}: ${err.message}`);
    }
  }

  function requireReady() {
    if (!connection.isReady()) {
      throw AppError.unavailable(`WhatsApp is not connected yet (state: ${connection.getState()})`);
    }
  }

  // Save state to Mongo only when it actually changed (not on every loading %).
  function persistState(status) {
    const key = `${status.state}|${status.lastError}|${status.sessionSavedAt}`;
    if (key === lastPersisted) return;
    lastPersisted = key;
    Settings.patch({
      waState: status.state,
      waLastError: status.lastError,
      ...(status.sessionSavedAt && { sessionSavedAt: status.sessionSavedAt }),
    }).catch((err) => logger.warn({ err: err.message }, 'Could not persist WhatsApp state'));
  }

  // Messages sent while we were offline: fetch the last N from the group.
  // Already-saved ones are skipped by the unique waMessageId, so this is safe to repeat.
  async function backfill() {
    if (!selectedGroup || backfillLimit === 0) return null;
    try {
      const messages = await connection.fetchRecentMessages(selectedGroup.id, backfillLimit);
      const counts = {};
      for (const msg of messages) {
        const result = await listener.handle(msg, { group: selectedGroup, source: 'backfill' });
        counts[result] = (counts[result] ?? 0) + 1;
      }
      logger.info({ group: selectedGroup.name, ...counts }, 'Backfill finished');
      return counts;
    } catch (err) {
      logger.error({ err: err.message }, 'Backfill failed');
      return null;
    }
  }

  return {
    async init() {
      const settings = await Settings.get();
      if (settings.selectedGroupId) {
        selectedGroup = { id: settings.selectedGroupId, name: settings.selectedGroupName };
      }

      connection.on('state', (status) => {
        persistState(status);
        emit('wa:state', { ...status, selectedGroup });
      });
      connection.on('message', (msg) => listener.handle(msg, { group: selectedGroup }));
      connection.on('ready', () => backfill());
    },

    getStatus,
    getState: () => connection.getState(),

    async listGroups() {
      requireReady();
      return callWhatsApp('list groups', () => connection.getGroups());
    },

    async selectGroup(groupId) {
      requireReady();
      const groups = await callWhatsApp('list groups', () => connection.getGroups());
      const group = groups.find((g) => g.id === groupId);
      if (!group) throw AppError.notFound('This WhatsApp account is not a member of that group');

      await Settings.patch({ selectedGroupId: group.id, selectedGroupName: group.name });
      selectedGroup = { id: group.id, name: group.name };
      logger.info({ group: group.name }, 'Listening to group');
      emit('wa:state', getStatus());
      return selectedGroup;
    },

    async logout() {
      if (connection.getState() === 'stopped') throw AppError.conflict('WhatsApp is not running');
      await connection.logout();
      // The group belongs to the old account, so forget it.
      await Settings.patch({ selectedGroupId: null, selectedGroupName: null });
      selectedGroup = null;
      emit('wa:state', getStatus());
      return getStatus();
    },
  };
}
