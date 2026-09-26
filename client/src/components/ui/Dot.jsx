import styles from './Dot.module.css';

// color: any CSS value, normally a token such as 'var(--danger)'
export default function Dot({ color = 'var(--text-muted)', pulse = false, className = '' }) {
  return <span className={`${styles.dot} ${pulse ? styles.pulse : ''} ${className}`} style={{ background: color }} aria-hidden />;
}
