import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { toast } from 'sonner';
import { messagesApi } from '../../api/messages.js';
import { isMock } from '../../api/http.js';
import { useModalFlag } from '../../hooks/useHotkeys.js';
import { CATEGORIES } from '../../lib/categories.js';
import { relativeTime } from '../../lib/format.js';
import Dot from '../ui/Dot.jsx';
import { useLive } from '../../hooks/useLive.jsx';
import styles from './CommandPalette.module.css';

// Dev-only controls, loaded once and only in mock mode.
const mock = isMock ? import('../../api/mock/server.js').then((m) => m.mockControls) : null;

async function retryAllFailed(groupId) {
  if (!groupId) return toast('No group selected');
  const { items } = await messagesApi.list({ groupId, status: 'failed', limit: 100 });
  if (!items.length) return toast('No failed messages');
  const results = await Promise.allSettled(items.map((m) => messagesApi.retry(m._id)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) toast.error(`${failed.length} of ${items.length} could not be retried`, { description: failed[0].reason.message });
  else toast.success(`Retrying ${items.length} message${items.length === 1 ? '' : 's'}`);
}

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [value, setValue] = useState('');
  const { groupId } = useLive();
  useModalFlag(open);

  // Search results arrive after typing; highlight the first one so Enter opens it.
  useEffect(() => {
    if (results.length) setValue(`message ${results[0]._id}`);
  }, [results]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Server-side message search, debounced.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !groupId) return setResults([]);
    const t = setTimeout(() => {
      messagesApi
        .list({ groupId, q, limit: 8 })
        .then((d) => setResults(d.items))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [search, groupId]);

  const run = (fn) => () => {
    onOpenChange(false);
    Promise.resolve(fn()).catch((e) => toast.error(e.message));
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      value={value}
      onValueChange={setValue}
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      className={styles.command}
    >
      <Command.Input value={search} onValueChange={setSearch} placeholder="Type a command or search messages" className={styles.input} />
      <Command.List className={styles.list}>
        <Command.Empty className={styles.empty}>No results</Command.Empty>

        {results.length > 0 && (
          <Command.Group heading="Messages" className={styles.group}>
            {results.map((m) => (
              <Command.Item key={m._id} value={`message ${m._id}`} forceMount onSelect={run(() => navigate(`/messages?open=${m._id}`))} className={styles.item}>
                <span className={styles.itemText}>
                  <span className={styles.sender}>{m.senderName}</span> {m.body || (m.type === 'image' ? 'Image' : '')}
                </span>
                <span className={`mono ${styles.hint}`}>{relativeTime(m.timestamp)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Go to" className={styles.group}>
          <Command.Item onSelect={run(() => navigate('/inbox'))} className={styles.item}>
            Inbox
          </Command.Item>
          <Command.Item onSelect={run(() => navigate('/messages'))} className={styles.item}>
            All messages
          </Command.Item>
          <Command.Item onSelect={run(() => navigate('/connection'))} className={styles.item}>
            Connection
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Filter by category" className={styles.group}>
          {CATEGORIES.map((c) => (
            <Command.Item
              key={c.value}
              value={`filter category ${c.value}`}
              onSelect={run(() => navigate(`/messages?category=${encodeURIComponent(c.value)}`))}
              className={styles.item}
            >
              <Dot color={c.color} />
              <span className={styles.itemText}>{c.value}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions" className={styles.group}>
          <Command.Item onSelect={run(() => retryAllFailed(groupId))} className={styles.item}>
            Retry all failed
          </Command.Item>
          <Command.Item onSelect={run(() => navigate('/messages?status=needs_review'))} className={styles.item}>
            Show messages that need review
          </Command.Item>
        </Command.Group>

        {mock && (
          <Command.Group heading="Mock mode" className={styles.group}>
            <Command.Item onSelect={run(async () => (await mock).receiveMessage())} className={styles.item}>
              Receive a new message
            </Command.Item>
            <Command.Item onSelect={run(async () => (await mock).simulateDisconnect())} className={styles.item}>
              Simulate WhatsApp disconnect
            </Command.Item>
            <Command.Item onSelect={run(async () => (await mock).toggleSocket())} className={styles.item}>
              Toggle live connection
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
