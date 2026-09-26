import styles from './Toggle.module.css';

export default function Toggle({ checked, onChange, label, id }) {
  return (
    <label className={styles.wrap} htmlFor={id}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`${styles.track} ${checked ? styles.on : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
