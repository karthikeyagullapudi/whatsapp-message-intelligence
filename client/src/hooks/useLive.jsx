import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { whatsappApi } from '../api/whatsapp.js';
import { messagesApi } from '../api/messages.js';
import { useSocketConnected, useSocketEvent } from './useSocket.js';

// App-wide live state: WhatsApp connection status and queue counts per status.
// Loaded once, then kept fresh by socket events.
const LiveContext = createContext(null);

const STATE_TOASTS = {
  ready: ['success', 'WhatsApp connected'],
  disconnected: ['error', 'WhatsApp disconnected'],
  error: ['error', 'WhatsApp failed to start'],
};

export function LiveProvider({ children }) {
  const [wa, setWa] = useState(null);
  const [stats, setStats] = useState(null);
  const socketConnected = useSocketConnected();
  const previousState = useRef(null);
  const statsTimer = useRef(null);

  // Everything the UI shows is scoped to the selected group. After a logout
  // there is no group, so the old account's messages are not shown or counted.
  const groupId = wa?.selectedGroup?.id ?? null;
  const groupRef = useRef(groupId);
  groupRef.current = groupId;

  const fetchStats = useCallback(() => {
    const id = groupRef.current;
    if (!id) return setStats({});
    messagesApi
      .stats({ groupId: id })
      .then((s) => groupRef.current === id && setStats(s))
      .catch(() => {});
  }, []);

  const refreshStats = useCallback(() => {
    clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(fetchStats, 250);
  }, [fetchStats]);

  useEffect(() => {
    whatsappApi
      .status()
      .then(setWa)
      .catch((e) => toast.error(e.message));
    return () => clearTimeout(statsTimer.current);
  }, []);

  // Counts for the current group (again whenever the group changes).
  const waLoaded = wa !== null;
  useEffect(() => {
    if (waLoaded) fetchStats();
  }, [waLoaded, groupId, fetchStats]);

  // Refetch after the socket reconnects: events sent while offline are lost.
  useEffect(() => {
    if (!socketConnected) return;
    whatsappApi.status().then(setWa).catch(() => {});
    refreshStats();
  }, [socketConnected, refreshStats]);

  useSocketEvent('wa:state', (status) => {
    setWa(status);
    const prev = previousState.current;
    previousState.current = status.state;
    if (prev && prev !== status.state && STATE_TOASTS[status.state]) {
      const [kind, text] = STATE_TOASTS[status.state];
      toast[kind](text, { description: status.state === 'ready' ? undefined : status.lastError ?? undefined });
    }
  });
  useSocketEvent('message:new', refreshStats);
  useSocketEvent('message:updated', refreshStats);

  useEffect(() => {
    if (wa && previousState.current === null) previousState.current = wa.state;
  }, [wa]);

  return (
    <LiveContext.Provider value={{ wa, setWa, groupId, stats: stats ?? {}, statsLoaded: stats !== null, socketConnected }}>
      {children}
    </LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);
