import { useCallback, useEffect, useRef, useState } from 'react';
import { messagesApi } from '../api/messages.js';
import { useSocketEvent } from './useSocket.js';

const matches = (m, { groupId, status, category }) =>
  (!groupId || m.groupId === groupId) &&
  (!status || m.processing?.status === status) &&
  (!category || (m.review?.category ?? m.ai?.category) === category);

// List state for one set of filters: first page, "load more", live updates
// from the socket, and a per-row `flash` token so new/changed rows can highlight.
// enabled=false (e.g. no group selected) → no requests, empty list.
export function useMessages(params, { pageSize = 50, enabled = true } = {}) {
  const key = JSON.stringify(params);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState({});
  const loadedPages = useRef(1);
  const reloadTimer = useRef(null);
  const pendingFlash = useRef(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const markFlash = useCallback((id) => setFlash((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 })), []);

  const fetchPages = useCallback(async () => {
    const data = await messagesApi.list({ ...JSON.parse(key), page: 1, limit: pageSize * loadedPages.current });
    setItems(data.items);
    setTotal(data.total);
    setPages(Math.ceil(data.total / pageSize) || 1);
    setError(null);
    // Highlight rows that arrived via message:new once they are in the list.
    pendingFlash.current.forEach((id) => data.items.some((m) => m._id === id) && markFlash(id));
    pendingFlash.current.clear();
  }, [key, pageSize, markFlash]);

  const reload = useCallback(async () => {
    if (!enabled) {
      // Nothing to show yet (status still loading, or no group); stay in the loading state.
      setItems([]);
      setTotal(0);
      return;
    }
    try {
      await fetchPages();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchPages, enabled]);

  useEffect(() => {
    loadedPages.current = 1;
    setLoading(true);
    reload();
    return () => clearTimeout(reloadTimer.current);
  }, [reload]);

  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(reload, 300);
  }, [reload]);

  async function loadMore() {
    setLoadingMore(true);
    loadedPages.current += 1;
    await reload();
    setLoadingMore(false);
  }

  useSocketEvent('message:new', (m) => {
    pendingFlash.current.add(m._id);
    scheduleReload();
  });

  useSocketEvent('message:updated', (doc) => {
    if (itemsRef.current.some((m) => m._id === doc._id)) {
      setItems((list) => list.map((m) => (m._id === doc._id ? doc : m)));
      markFlash(doc._id);
    }
    else if (matches(doc, JSON.parse(key))) {
      pendingFlash.current.add(doc._id);
      scheduleReload();
    }
  });

  // Optimistic helpers
  const patchItem = useCallback((id, fn) => setItems((list) => list.map((m) => (m._id === id ? fn(m) : m))), []);
  const removeItem = useCallback((id) => setItems((list) => list.filter((m) => m._id !== id)), []);
  const restoreItem = useCallback(
    (item, index) =>
      setItems((list) => {
        if (list.some((m) => m._id === item._id)) return list;
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, item);
        return next;
      }),
    [],
  );

  return {
    items,
    total,
    hasMore: loadedPages.current < pages,
    loading,
    loadingMore,
    error,
    flash,
    loadMore,
    patchItem,
    removeItem,
    restoreItem,
  };
}
