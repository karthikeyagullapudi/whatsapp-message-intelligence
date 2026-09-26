import { useLive } from '../../hooks/useLive.jsx';
import Dot from '../ui/Dot.jsx';
import { waStateInfo } from './waState.js';
import styles from './TopBar.module.css';

export default function TopBar({ title }) {
  const { wa, stats, statsLoaded } = useLive();
  const info = waStateInfo(wa?.state);
  const count = (s) => stats[s] ?? 0;

  return (
    <header className={styles.bar}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.strip} aria-live="polite">
        <span className={styles.item}>
          <Dot color={info.color} pulse={wa?.state === 'initializing' || wa?.state === 'authenticated'} />
          <span>{wa ? info.label : 'Loading'}</span>
        </span>
        {wa?.selectedGroup && (
          <span className={`${styles.item} ${styles.group}`} title={wa.selectedGroup.name}>
            {wa.selectedGroup.name}
          </span>
        )}
        {statsLoaded && (
          <span className={`mono ${styles.item} ${styles.counts}`}>
            pending {count('pending')} · processing {count('processing')} ·{' '}
            <span className={count('failed') ? styles.failed : ''}>failed {count('failed')}</span>
          </span>
        )}
      </div>
    </header>
  );
}
