import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Inbox, List, PanelLeft, Plug } from 'lucide-react';
import { useLive } from '../../hooks/useLive.jsx';
import Dot from '../ui/Dot.jsx';
import Kbd from '../ui/Kbd.jsx';
import { useShell } from './Shell.jsx';
import styles from './Sidebar.module.css';

const narrow = () => window.matchMedia('(max-width: 900px)').matches;

function readCollapsed() {
  try {
    return localStorage.getItem('sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

export default function Sidebar() {
  const { stats, wa, socketConnected } = useLive();
  const shell = useShell();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [forced, setForced] = useState(narrow);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => setForced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }

  const isCollapsed = collapsed || forced;
  const inboxCount = stats.needs_review ?? 0;
  const live = socketConnected && wa?.state === 'ready';
  const liveLabel = !socketConnected ? 'Reconnecting' : wa?.state === 'ready' ? 'Live' : 'WhatsApp offline';

  const items = [
    { to: '/inbox', label: 'Inbox', icon: Inbox, count: inboxCount },
    { to: '/messages', label: 'All messages', icon: List },
    { to: '/connection', label: 'Connection', icon: Plug },
  ];

  return (
    <nav className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`} aria-label="Main">
      <div className={styles.top}>
        {!isCollapsed && <span className={styles.app}>Message intelligence</span>}
        {!forced && (
          <button type="button" className={styles.iconButton} onClick={toggle} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <ul className={styles.nav}>
        {items.map(({ to, label, icon: Icon, count }) => (
          <li key={to}>
            <NavLink to={to} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`} title={isCollapsed ? label : undefined}>
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              {!isCollapsed && <span className={styles.linkLabel}>{label}</span>}
              {count > 0 && <span className={`mono ${styles.count}`}>{count}</span>}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={styles.bottom}>
        {!isCollapsed && (
          <button type="button" className={styles.search} onClick={shell.openPalette}>
            <span>Search or jump</span>
            <Kbd>⌘K</Kbd>
          </button>
        )}
        <div className={styles.live} title={liveLabel}>
          <Dot color={live ? 'var(--accent)' : 'var(--warning)'} pulse={!socketConnected} />
          {!isCollapsed && <span>{liveLabel}</span>}
        </div>
      </div>
    </nav>
  );
}
