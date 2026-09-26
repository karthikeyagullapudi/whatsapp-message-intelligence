import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { messagesApi } from '../api/messages.js';

const UNDO_MS = 5000;

// Approvals wait UNDO_MS before they are sent, so "Undo" never needs a server
// endpoint: undo just cancels the timer. If the page is closed during the
// window, pending approvals are flushed with keepalive requests.
const pending = new Map(); // id → { timer, body }

function flushAll() {
  pending.forEach(({ timer, body }, id) => {
    clearTimeout(timer);
    messagesApi.review(id, body, { keepalive: true }).catch(() => {});
  });
  pending.clear();
}

export function useApprove() {
  useEffect(() => {
    window.addEventListener('pagehide', flushAll);
    return () => window.removeEventListener('pagehide', flushAll);
  }, []);

  // onOptimistic(): update the UI now. onRevert(): put it back (undo or error).
  return useCallback((message, body, { onOptimistic, onRevert, onSaved } = {}) => {
    const id = message._id;
    onOptimistic?.();

    const timer = setTimeout(async () => {
      pending.delete(id);
      try {
        const saved = await messagesApi.review(id, body);
        onSaved?.(saved);
      } catch (e) {
        onRevert?.();
        toast.error('Approve failed', { description: e.details?.map((d) => `${d.path}: ${d.message}`).join('; ') || e.message });
      }
    }, UNDO_MS);
    pending.set(id, { timer, body });

    toast('Approved', {
      description: body.category,
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const entry = pending.get(id);
          if (!entry) return; // already sent
          clearTimeout(entry.timer);
          pending.delete(id);
          onRevert?.();
        },
      },
    });
  }, []);
}
