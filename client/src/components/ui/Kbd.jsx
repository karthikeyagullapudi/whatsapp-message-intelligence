import styles from './Kbd.module.css';

export default function Kbd({ children, className = '' }) {
  return <kbd className={`${styles.kbd} ${className}`}>{children}</kbd>;
}
