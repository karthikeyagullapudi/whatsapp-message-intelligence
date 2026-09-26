import { X } from 'lucide-react';
import styles from './Chip.module.css';

export default function Chip({ children, onRemove, invalid = false, removeLabel = 'Remove' }) {
  return (
    <span className={`${styles.chip} ${invalid ? styles.invalid : ''}`}>
      <span className={styles.label}>{children}</span>
      {onRemove && (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={removeLabel}>
          <X size={12} strokeWidth={1.5} />
        </button>
      )}
    </span>
  );
}
