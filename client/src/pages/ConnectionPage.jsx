import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { whatsappApi } from '../api/whatsapp.js';
import { useLive } from '../hooks/useLive.jsx';
import { useNow } from '../hooks/useNow.js';
import { absoluteTime, phoneFromId } from '../lib/format.js';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import styles from './ConnectionPage.module.css';

const STEPS = ['Start session', 'Scan QR', 'Syncing', 'Listening'];

// Which step is current for a given WhatsApp state.
function currentStep(wa) {
  switch (wa?.state) {
    case 'qr':
      return 1;
    case 'authenticated':
      return 2;
    case 'ready':
      return 3;
    default:
      return 0; // stopped, initializing, disconnected, error
  }
}

function Steps({ step, done }) {
  return (
    <ol className={styles.steps}>
      {STEPS.map((label, i) => {
        const complete = i < step || (i === step && done);
        const current = i === step && !done;
        return (
          <li key={label} className={`${styles.step} ${complete ? styles.complete : ''} ${current ? styles.current : ''}`} aria-current={current ? 'step' : undefined}>
            <span className={styles.marker}>{complete ? <Check size={12} strokeWidth={2} aria-hidden /> : <span className="mono">{i + 1}</span>}</span>
            <span className={styles.stepLabel}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Searchable combobox of the account's groups.
function GroupPicker({ selected, onSelect }) {
  const [groups, setGroups] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    whatsappApi
      .groups()
      .then((d) => setGroups(d.groups))
      .catch((e) => {
        setGroups([]);
        toast.error('Could not load groups', { description: e.message });
      });
  }, []);

  const filtered = useMemo(
    () => (groups ?? []).filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 100),
    [groups, query],
  );

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  async function choose(group) {
    setOpen(false);
    setQuery('');
    setBusy(true);
    try {
      await onSelect(group);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && filtered[active]) choose(filtered[active]);
    else if (e.key === 'Escape') setOpen(false);
    else return;
    e.preventDefault();
    setOpen(true);
  }

  if (!groups) return <Skeleton width={360} height={28} />;

  return (
    <div className={styles.combobox}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="group-list"
        aria-activedescendant={open && filtered[active] ? `group-${active}` : undefined}
        className={styles.comboInput}
        placeholder={selected ? `Change group (${groups.length} available)` : `Search ${groups.length} groups`}
        value={query}
        disabled={busy}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id="group-list" role="listbox" ref={listRef} className={styles.options}>
          {filtered.length === 0 && <li className={styles.noOptions}>No groups match</li>}
          {filtered.map((g, i) => (
            <li
              key={g.id}
              id={`group-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.activeOption : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(g);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={styles.optionName}>{g.name}</span>
              {g.id === selected?.id && <Check size={14} strokeWidth={1.5} aria-label="Selected" />}
              {g.participants ? <span className="mono">{g.participants}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ConnectionPage() {
  const { wa, setWa } = useLive();
  const now = useNow(1000);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!wa) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Skeleton width={200} height={16} />
          <Skeleton width={320} />
        </div>
      </div>
    );
  }

  const step = currentStep(wa);
  const ready = wa.state === 'ready';
  const failed = wa.state === 'disconnected' || wa.state === 'error';
  const retryIn = wa.nextRetryAt ? Math.max(0, Math.ceil((new Date(wa.nextRetryAt).getTime() - now) / 1000)) : null;

  async function selectGroup(group) {
    try {
      const { selectedGroup } = await whatsappApi.selectGroup(group.id);
      setWa((w) => ({ ...w, selectedGroup }));
      toast.success(`Listening to ${selectedGroup.name}`);
    } catch (e) {
      toast.error('Could not select group', { description: e.message });
    }
  }

  async function logout() {
    setBusy(true);
    try {
      setWa(await whatsappApi.logout());
      setConfirmLogout(false);
      toast('Logged out', { description: 'Scan a new QR code to link a device.' });
    } catch (e) {
      toast.error('Log out failed', { description: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.progress}>
        <Steps step={step} done={ready && Boolean(wa.selectedGroup)} />
      </aside>

      <section className={styles.panel}>
        {step === 0 && (
          <div className={styles.block}>
            <h2 className={styles.heading}>{failed ? 'Connection lost' : 'Starting WhatsApp Web'}</h2>
            {failed ? (
              <>
                <p className={styles.errorText}>{wa.lastError ?? 'WhatsApp is not connected.'}</p>
                <p className={styles.muted}>
                  {retryIn != null ? (
                    <>
                      Reconnecting in <span className="mono">{retryIn}s</span>
                    </>
                  ) : (
                    'Reconnecting…'
                  )}
                </p>
              </>
            ) : (
              <p className={styles.muted}>Launching the browser session. This takes about 10 seconds.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className={styles.block}>
            <h2 className={styles.heading}>Scan to link this device</h2>
            <p className={styles.muted}>WhatsApp → Settings → Linked devices → Link a device</p>
            <div className={styles.qr}>
              {wa.qr ? <img key={wa.qr} src={wa.qr} alt="WhatsApp QR code" width={240} height={240} className={styles.qrImage} /> : <Skeleton width={240} height={240} />}
            </div>
            <p className={styles.faint}>The code refreshes automatically.</p>
          </div>
        )}

        {step === 2 && (
          <div className={styles.block}>
            <h2 className={styles.heading}>Syncing chats</h2>
            <p className={styles.muted}>
              Linked. Loading chats from the phone
              {wa.loadingPercent ? (
                <>
                  {' '}
                  · <span className="mono">{wa.loadingPercent}%</span>
                </>
              ) : (
                '…'
              )}
            </p>
            <div className={styles.bar}>
              <span style={{ width: `${wa.loadingPercent ?? 10}%` }} />
            </div>
          </div>
        )}

        {ready && (
          <div className={styles.block}>
            <div className={styles.account}>
              <span className={styles.accountName}>{wa.account?.name ?? 'WhatsApp'}</span>
              <span className={`mono ${styles.faint}`}>{phoneFromId(wa.account?.id)}</span>
            </div>
            <p className={styles.muted}>
              {wa.sessionSavedAt ? (
                <>
                  Session saved <span className="mono">{absoluteTime(wa.sessionSavedAt)}</span>. Restarting the server will not need a new QR.
                </>
              ) : (
                'Saving the session. Wait about a minute before restarting the server.'
              )}
            </p>
            {wa.waState && wa.waState !== 'CONNECTED' && (
              <p className={styles.warningText}>Phone reports {wa.waState}. WhatsApp reconnects on its own.</p>
            )}

            <div className={styles.divider} />

            <h2 className={styles.heading}>Group</h2>
            {wa.selectedGroup ? (
              <p className={styles.listening}>
                Listening to <span className={styles.groupName}>{wa.selectedGroup.name}</span>
              </p>
            ) : (
              <p className={styles.muted}>Choose the group to capture. Nothing is saved until you do.</p>
            )}
            <GroupPicker selected={wa.selectedGroup} onSelect={selectGroup} />

            <div className={styles.divider} />

            {confirmLogout ? (
              <div className={styles.confirm} role="alert">
                <span>Log out and unlink this device? You will need to scan a new QR code.</span>
                <Button onClick={() => setConfirmLogout(false)} disabled={busy} autoFocus>
                  Cancel
                </Button>
                <Button variant="danger" onClick={logout} disabled={busy}>
                  {busy ? 'Logging out' : 'Log out'}
                </Button>
              </div>
            ) : (
              <div>
                <Button variant="danger" onClick={() => setConfirmLogout(true)}>
                  Log out
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
