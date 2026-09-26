import { useEffect, useId, useRef, useState } from 'react';
import styles from './Menu.module.css';

// Small dropdown menu. `trigger` is a render function receiving button props.
// items: [{ key, label, onSelect, danger?, disabled?, dot?, count?, checked? }] or { separator: true }
export default function Menu({ trigger, items, align = 'left', onOpen, width = 200, label }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const list = useRef(null);
  const triggerRef = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    onOpen?.();
    list.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    const onDown = (e) => !root.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e) {
    const entries = [...list.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const i = entries.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') entries[(i + 1) % entries.length]?.focus();
    else if (e.key === 'ArrowUp') entries[(i - 1 + entries.length) % entries.length]?.focus();
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') setOpen(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div className={styles.root} ref={root} onClick={(e) => e.stopPropagation()}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        'aria-label': label,
        onClick: () => setOpen((o) => !o),
      })}
      {open && (
        <div id={id} ref={list} role="menu" className={`${styles.menu} ${styles[align]}`} style={{ width }} onKeyDown={onKeyDown}>
          {items.map((item, i) =>
            item.separator ? (
              <div key={`sep-${i}`} className={styles.separator} role="separator" />
            ) : (
              <button
                key={item.key ?? item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`${styles.item} ${item.danger ? styles.danger : ''} ${item.checked ? styles.checked : ''}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.dot && <span className={styles.dot} style={{ background: item.dot }} aria-hidden />}
                <span className={styles.label}>{item.label}</span>
                {item.count != null && <span className={styles.count}>{item.count}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
