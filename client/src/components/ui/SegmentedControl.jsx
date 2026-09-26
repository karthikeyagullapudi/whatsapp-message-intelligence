import { useRef } from 'react';
import styles from './SegmentedControl.module.css';

// Radio group rendered as joined buttons. Arrow keys move between options.
// options: [{ value, label, hint?, dot? }]
export default function SegmentedControl({ label, options, value, onChange, wrap = false }) {
  const refs = useRef([]);

  function onKeyDown(e, index) {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <div role="radiogroup" aria-label={label} className={`${styles.group} ${wrap ? styles.wrap : ''}`}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === selectedIndex ? 0 : -1}
            className={`${styles.option} ${checked ? styles.checked : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.dot && <span className={styles.dot} style={{ background: o.dot }} aria-hidden />}
            <span>{o.label}</span>
            {o.hint && <span className={styles.hint}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
