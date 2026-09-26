import { useEffect, useRef } from 'react';

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// bindings: { 'j': fn, 'ArrowDown': fn, '?': fn, 'mod+k': fn }
// Plain keys are ignored while typing in a field, when a modifier is held, or
// while a modal layer (palette, sheet, lightbox) is open. 'mod+…' always fires.
export function useHotkeys(bindings) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (mod) {
        const fn = ref.current[`mod+${key}`];
        if (fn) {
          e.preventDefault();
          fn(e);
        }
        return;
      }
      if (e.altKey || isTyping(e.target) || document.body.dataset.modal) return;
      const fn = ref.current[e.key === '?' ? '?' : key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// Marks the page as having a modal open so single-key shortcuts pause.
export function useModalFlag(open) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.dataset.modal = String(Number(document.body.dataset.modal ?? 0) + 1);
    return () => {
      const n = Number(document.body.dataset.modal ?? 1) - 1;
      if (n <= 0) delete document.body.dataset.modal;
      else document.body.dataset.modal = String(n);
    };
  }, [open]);
}
