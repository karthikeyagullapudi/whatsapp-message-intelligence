import { createContext, useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useHotkeys } from '../../hooks/useHotkeys.js';
import { useLive } from '../../hooks/useLive.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import CommandPalette from './CommandPalette.jsx';
import ShortcutSheet from './ShortcutSheet.jsx';
import styles from './Shell.module.css';

const TITLES = { '/inbox': 'Inbox', '/messages': 'All messages', '/connection': 'Connection' };
const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

export default function Shell({ children }) {
  const { pathname } = useLocation();
  const { socketConnected } = useLive();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useHotkeys({
    'mod+k': () => setPaletteOpen((o) => !o),
    '?': () => setSheetOpen(true),
  });

  const title = Object.entries(TITLES).find(([p]) => pathname.startsWith(p))?.[1] ?? '';

  return (
    <ShellContext.Provider value={{ openPalette: () => setPaletteOpen(true), openShortcuts: () => setSheetOpen(true) }}>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.main}>
          <TopBar title={title} />
          {!socketConnected && (
            <div className={styles.banner} role="status">
              Live updates paused — reconnecting…
            </div>
          )}
          <main className={styles.content}>{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </ShellContext.Provider>
  );
}
