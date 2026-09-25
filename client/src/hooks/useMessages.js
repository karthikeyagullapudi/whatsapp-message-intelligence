import { useCallback, useEffect, useRef, useState } from 'react';
import { messagesApi } from '../api/messages.js';
import { useSocketEvent } from './useSocket.js';

// Loads a page of messages for the given filters and reloads (debounced)
// whenever the server says a message was created or changed.
export function useMessages(params) {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params);
  const timer = useRef(null);

  const reload = useCallback(async () => {
    try {
      setData(await messagesApi.list(JSON.parse(key)));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  const scheduleReload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, 400);
  }, [reload]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useSocketEvent('message:new', scheduleReload);
  useSocketEvent('message:updated', scheduleReload);

  return { ...data, loading, error, reload };
}

// Count of messages per status, kept live (used for the nav badge).
export function useMessageStats() {
  const [stats, setStats] = useState({});
  const reload = useCallback(() => messagesApi.stats().then(setStats).catch(() => {}), []);
  useEffect(() => {
    reload();
  }, [reload]);
  useSocketEvent('message:new', reload);
  useSocketEvent('message:updated', reload);
  return stats;
}
