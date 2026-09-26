import Dot from '../ui/Dot.jsx';
import { statusInfo } from '../../lib/categories.js';
import styles from './labels.module.css';

const SKIP = { duplicate: 'duplicate', unsupported_type: 'unsupported' };

export default function StatusLabel({ processing }) {
  const info = statusInfo(processing?.status);
  const extra = SKIP[processing?.skipReason];
  return (
    <span className={styles.label}>
      <Dot color={info.color} pulse={processing?.status === 'processing'} />
      <span className={styles.status}>
        {info.label}
        {extra && <span className={styles.muted}> · {extra}</span>}
      </span>
    </span>
  );
}
