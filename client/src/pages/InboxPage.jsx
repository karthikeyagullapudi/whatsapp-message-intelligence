import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { useMessages } from '../hooks/useMessages.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useApprove } from '../hooks/useApprove.js';
import { useNow } from '../hooks/useNow.js';
import { canApprove, draftFrom, toReviewBody } from '../hooks/useReviewDraft.js';
import { CATEGORIES } from '../lib/categories.js';
import { relativeTime } from '../lib/format.js';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import CategoryLabel from '../components/message/CategoryLabel.jsx';
import Confidence from '../components/message/Confidence.jsx';
import MessageDetail from '../components/message/MessageDetail.jsx';
import NoGroup from '../components/message/NoGroup.jsx';
import { useLive } from '../hooks/useLive.jsx';
import styles from './InboxPage.module.css';

const LEAVE_MS = 160;

function Row({ message, selected, leaving, onSelect, now }) {
  const ref = useRef(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={`${styles.row} ${selected ? styles.selected : ''} ${leaving ? styles.leaving : ''}`}
        onClick={onSelect}
        aria-current={selected || undefined}
      >
        <span className={styles.rowTop}>
          <span className={styles.sender}>{message.senderName ?? 'Unknown'}</span>
          <span className={`mono ${styles.time}`}>{relativeTime(message.timestamp, now)}</span>
        </span>
        <span className={styles.preview}>
          {message.type === 'image' && <ImageIcon size={14} strokeWidth={1.5} className={styles.previewIcon} aria-label="Image" />}
          {message.body || (message.type === 'image' ? 'Image, no caption' : '')}
        </span>
        <span className={styles.rowBottom}>
          <CategoryLabel category={message.ai?.category} />
          <Confidence value={message.ai?.confidence} />
        </span>
      </button>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className={styles.skeletonRow}>
      <span className={styles.rowTop}>
        <Skeleton width="40%" />
        <Skeleton width={24} />
      </span>
      <Skeleton width="85%" />
      <Skeleton width="35%" />
    </li>
  );
}

export default function InboxPage() {
  const { wa, groupId } = useLive();
  const queue = useMessages({ groupId, status: 'needs_review', sort: 'oldest' }, { pageSize: 100, enabled: Boolean(groupId) });
  const approve = useApprove();
  const now = useNow();
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [leaving, setLeaving] = useState(() => new Set());
  const summaryRef = useRef(null);

  // Items may change status via the socket (e.g. someone else approved it).
  const items = queue.items.filter((m) => m.processing.status === 'needs_review');
  const index = items.findIndex((m) => m._id === selectedId);
  const selected = index >= 0 ? items[index] : null;
  const lastIndex = useRef(0);

  // Keep a valid selection: same position when the current row disappears.
  useEffect(() => {
    if (selected) {
      lastIndex.current = index;
      return;
    }
    const remaining = items.filter((m) => !leaving.has(m._id));
    if (remaining.length) setSelectedId(remaining[Math.min(lastIndex.current, remaining.length - 1)]._id);
  }, [selected, index, items, leaving]);

  const draft = selected ? (drafts[selected._id] ?? draftFrom(selected)) : null;
  const setDraft = useCallback(
    (fn) =>
      setDrafts((all) => {
        if (!selected) return all;
        const current = all[selected._id] ?? draftFrom(selected);
        return { ...all, [selected._id]: typeof fn === 'function' ? fn(current) : fn };
      }),
    [selected],
  );

  const move = (delta) => {
    if (!items.length) return;
    const next = Math.min(Math.max((index < 0 ? 0 : index) + delta, 0), items.length - 1);
    setSelectedId(items[next]._id);
  };

  function doApprove() {
    if (!selected || !canApprove(draft) || leaving.has(selected._id)) return;
    const message = selected;
    const position = index;
    const body = toReviewBody(draft);

    approve(message, body, {
      onOptimistic: () => {
        // slide the row out, then remove it; the selection moves to the next row
        setLeaving((s) => new Set(s).add(message._id));
        setTimeout(() => {
          queue.removeItem(message._id);
          setLeaving((s) => {
            const n = new Set(s);
            n.delete(message._id);
            return n;
          });
        }, LEAVE_MS);
        const next = items[position + 1] ?? items[position - 1];
        lastIndex.current = position;
        setSelectedId(next?._id ?? null);
      },
      onRevert: () => {
        queue.restoreItem(message, position);
        setSelectedId(message._id);
      },
      onSaved: () =>
        setDrafts((all) => {
          const { [message._id]: _, ...rest } = all;
          return rest;
        }),
    });
  }

  const skip = () => move(1);

  const setCategory = (n) => () => {
    const c = CATEGORIES[n - 1];
    if (selected && c) setDraft((d) => ({ ...d, category: c.value }));
  };

  useHotkeys({
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    e: () => summaryRef.current?.focus(),
    a: doApprove,
    s: skip,
    1: setCategory(1),
    2: setCategory(2),
    3: setCategory(3),
    4: setCategory(4),
    5: setCategory(5),
    6: setCategory(6),
  });

  const empty = !queue.loading && items.length === 0;

  if (wa && !groupId) return <NoGroup wa={wa} />;

  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label="Needs review">
        <div className={styles.listHeader}>
          <span>Needs review</span>
          <span className="mono">{queue.loading ? '' : items.length}</span>
        </div>
        {queue.error && <p className={styles.error}>{queue.error}</p>}
        <ul className={styles.list}>
          {queue.loading
            ? Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} />)
            : items.map((m) => (
                <Row
                  key={m._id}
                  message={m}
                  now={now}
                  selected={m._id === selectedId}
                  leaving={leaving.has(m._id)}
                  onSelect={() => setSelectedId(m._id)}
                />
              ))}
        </ul>
      </section>

      <section className={styles.detailPane} aria-label="Message">
        {empty ? (
          <EmptyState action={<Link to="/messages">All messages</Link>}>
            Inbox zero. New messages that need a look will appear here.
          </EmptyState>
        ) : !selected ? (
          <div className={styles.detailSkeleton}>
            <Skeleton width={180} height={16} />
            <Skeleton width={260} />
            <Skeleton width="70%" height={40} />
            <Skeleton width="50%" />
          </div>
        ) : (
          <MessageDetail
            key={selected._id}
            message={selected}
            draft={draft}
            setDraft={setDraft}
            summaryRef={summaryRef}
            showKeys
            footer={
              <>
                <Button variant="primary" kbd="A" onClick={doApprove} disabled={!canApprove(draft)}>
                  Approve
                </Button>
                <Button kbd="S" onClick={skip} disabled={index >= items.length - 1}>
                  Skip
                </Button>
                <span className={`mono ${styles.position}`}>
                  {index + 1} / {items.length}
                </span>
              </>
            }
          />
        )}
      </section>
    </div>
  );
}
