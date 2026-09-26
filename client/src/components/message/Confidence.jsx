import { DEFAULT_THRESHOLD } from '../../lib/categories.js';
import styles from './labels.module.css';

// Number + optional thin 40px bar. Below the threshold the value turns amber.
export default function Confidence({ value, bar = false, threshold = DEFAULT_THRESHOLD }) {
  if (typeof value !== 'number') return <span className={styles.none}>–</span>;
  const low = value < threshold;
  return (
    <span className={styles.confidence}>
      <span className={`mono ${low ? styles.low : ''}`}>{value.toFixed(2)}</span>
      {bar && (
        <span className={styles.track} aria-hidden>
          <span className={`${styles.fill} ${low ? styles.fillLow : ''}`} style={{ width: `${Math.round(value * 100)}%` }} />
        </span>
      )}
    </span>
  );
}
