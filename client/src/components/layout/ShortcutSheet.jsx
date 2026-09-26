import { useEffect } from 'react';
import { useModalFlag } from '../../hooks/useHotkeys.js';
import Kbd from '../ui/Kbd.jsx';
import styles from './ShortcutSheet.module.css';

const GROUPS = [
  ['Anywhere', [[['⌘', 'K'], 'Command palette'], [['?'], 'Keyboard shortcuts']]],
  [
    'Inbox',
    [
      [['J'], 'Next message'],
      [['K'], 'Previous message'],
      [['↓'], 'Next message'],
      [['↑'], 'Previous message'],
      [['1', '–', '6'], 'Set category'],
      [['E'], 'Edit summary'],
      [['A'], 'Approve'],
      [['S'], 'Skip'],
    ],
  ],
  ['All messages', [[['/'], 'Search'], [['Esc'], 'Close drawer']]],
  ['Entities', [[['Enter'], 'Add chip'], [['⌫'], 'Remove last chip']]],
];

export default function ShortcutSheet({ open, onClose }) {
  useModalFlag(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Keyboard shortcuts</h2>
        <div className={styles.grid}>
          {GROUPS.map(([name, rows]) => (
            <section key={name}>
              <h3 className={styles.group}>{name}</h3>
              <dl className={styles.rows}>
                {rows.map(([keys, label]) => (
                  <div key={label + keys.join('')} className={styles.row}>
                    <dt>{label}</dt>
                    <dd>
                      {keys.map((k) => (k === '–' ? <span key={k} className={styles.dash}>–</span> : <Kbd key={k}>{k}</Kbd>))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
