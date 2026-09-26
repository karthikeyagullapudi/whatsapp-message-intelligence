import Dot from '../ui/Dot.jsx';
import { categoryColor } from '../../lib/categories.js';
import styles from './labels.module.css';

export default function CategoryLabel({ category }) {
  if (!category) return <span className={styles.none}>–</span>;
  return (
    <span className={styles.label}>
      <Dot color={categoryColor(category)} />
      <span className={styles.text}>{category}</span>
    </span>
  );
}
