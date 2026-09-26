import styles from './EmptyState.module.css';

export default function EmptyState({ children, action }) {
  return (
    <div className={styles.empty}>
      <p>{children}</p>
      {action}
    </div>
  );
}
