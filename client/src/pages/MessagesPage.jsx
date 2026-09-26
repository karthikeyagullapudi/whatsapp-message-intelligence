import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Image as ImageIcon, MoreHorizontal, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { messagesApi } from '../api/messages.js';
import { useMessages } from '../hooks/useMessages.js';
import { useLive } from '../hooks/useLive.jsx';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useApprove } from '../hooks/useApprove.js';
import { useNow } from '../hooks/useNow.js';
import { canApprove, toReviewBody, useReviewDraft } from '../hooks/useReviewDraft.js';
import { CATEGORIES, STATUSES, finalResult, statusInfo } from '../lib/categories.js';
import { absoluteTime, relativeTime } from '../lib/format.js';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import Drawer from '../components/ui/Drawer.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import FilterDropdown from '../components/ui/FilterDropdown.jsx';
import Kbd from '../components/ui/Kbd.jsx';
import Menu from '../components/ui/Menu.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import CategoryLabel from '../components/message/CategoryLabel.jsx';
import Confidence from '../components/message/Confidence.jsx';
import StatusLabel from '../components/message/StatusLabel.jsx';
import MessageDetail from '../components/message/MessageDetail.jsx';
import NoGroup from '../components/message/NoGroup.jsx';
import styles from './MessagesPage.module.css';

// Short background highlight when a row is new or changed (opacity/colour only).
function useFlash(ref, token) {
  useLayoutEffect(() => {
    if (!token || !ref.current?.animate) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--flash').trim();
    ref.current.animate([{ backgroundColor: color }, { backgroundColor: 'transparent' }], {
      duration: 1500,
      easing: 'ease-out',
    });
  }, [token, ref]);
}

function Row({ message, flash, now, onOpen, onRetry }) {
  const ref = useRef(null);
  useFlash(ref, flash);
  const result = finalResult(message);
  const failed = message.processing.status === 'failed';

  return (
    <tr ref={ref} className={styles.row} onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <td className={`mono ${styles.time}`} title={absoluteTime(message.timestamp)}>
        {relativeTime(message.timestamp, now)}
      </td>
      <td className={styles.sender}>{message.senderName ?? message.senderId}</td>
      <td className={styles.messageCell}>
        <div className={styles.messageLine}>
          {message.type === 'image' && <ImageIcon size={14} strokeWidth={1.5} className={styles.icon} aria-label="Image" />}
          <span className={message.body ? styles.body : styles.faint}>
            {message.body || (message.type === 'image' ? 'No caption' : `${message.waType ?? 'Unsupported'} message`)}
          </span>
        </div>
        {failed && (
          <div className={styles.failure}>
            <span className={styles.errorText}>{message.processing.lastError}</span>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </td>
      <td>
        <CategoryLabel category={result?.category} />
      </td>
      <td>
        <Confidence value={message.ai?.confidence} bar />
      </td>
      <td>
        <StatusLabel processing={message.processing} />
      </td>
      <td className={styles.actions}>
        <Menu
          align="right"
          width={160}
          label="Row actions"
          trigger={(props) => (
            <button type="button" className={styles.menuButton} {...props}>
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </button>
          )}
          items={[
            { key: 'open', label: 'Open', onSelect: onOpen },
            ...(failed ? [{ key: 'retry', label: 'Retry', onSelect: onRetry }] : []),
          ]}
        />
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return Array.from({ length: 12 }, (_, i) => (
    <tr key={i} className={styles.skeletonRow}>
      <td><Skeleton width={24} /></td>
      <td><Skeleton width={90} /></td>
      <td><Skeleton width={`${50 + ((i * 17) % 40)}%`} /></td>
      <td><Skeleton width={90} /></td>
      <td><Skeleton width={60} /></td>
      <td><Skeleton width={80} /></td>
      <td />
    </tr>
  ));
}

function DrawerContent({ message, onApprove, onClose }) {
  const [draft, setDraft] = useReviewDraft(message);
  return (
    <MessageDetail
      message={message}
      draft={draft}
      setDraft={setDraft}
      footer={
        <>
          <Button variant="primary" onClick={() => onApprove(message, toReviewBody(draft))} disabled={!canApprove(draft)}>
            Approve
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    />
  );
}

export default function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const openId = params.get('open');

  const { wa, groupId, stats } = useLive();
  const list = useMessages({ groupId, status, category, q }, { pageSize: 50, enabled: Boolean(groupId) });
  const approve = useApprove();
  const now = useNow();
  const searchRef = useRef(null);
  const [search, setSearch] = useState(q);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [drawerMessage, setDrawerMessage] = useState(null);

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: key === 'q' },
      ),
    [setParams],
  );

  // Search box → URL (debounced), URL → search box (back/forward, palette).
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => search.trim() !== q && setParam('q', search.trim()), 250);
    return () => clearTimeout(t);
  }, [search, q, setParam]);

  useHotkeys({ '/': () => searchRef.current?.focus() });

  // Drawer: use the row from the list, or fetch it (e.g. opened from the palette).
  useEffect(() => {
    if (!openId) return setDrawerMessage(null);
    const fromList = list.items.find((m) => m._id === openId);
    if (fromList) return setDrawerMessage(fromList);
    messagesApi
      .get(openId)
      .then(setDrawerMessage)
      .catch((e) => {
        toast.error(e.message);
        setParam('open', null);
      });
  }, [openId, list.items, setParam]);

  const loadCategoryCounts = useCallback(async () => {
    const totals = await Promise.all(
      CATEGORIES.map((c) => messagesApi.list({ groupId, status, q, category: c.value, limit: 1 }).then((d) => d.total).catch(() => null)),
    );
    setCategoryCounts(Object.fromEntries(CATEGORIES.map((c, i) => [c.value, totals[i]])));
  }, [groupId, status, q]);

  async function retry(message) {
    list.patchItem(message._id, (m) => ({ ...m, processing: { ...m.processing, status: 'pending', lastError: null } }));
    try {
      await messagesApi.retry(message._id);
      toast('Retrying', { description: message.body?.slice(0, 60) || undefined });
    } catch (e) {
      list.patchItem(message._id, () => message);
      toast.error('Retry failed', { description: e.message });
    }
  }

  function approveFromDrawer(message, body) {
    approve(message, body, {
      onOptimistic: () => {
        list.patchItem(message._id, (m) => ({ ...m, review: { ...body }, processing: { ...m.processing, status: 'approved' } }));
        setParam('open', null);
      },
      onRevert: () => list.patchItem(message._id, () => message),
    });
  }

  if (wa && !groupId) return <NoGroup wa={wa} />;

  const filters = [
    status && { key: 'status', label: `Status: ${statusInfo(status).label}` },
    category && { key: 'category', label: `Category: ${category}` },
    q && { key: 'q', label: `Search: ${q}` },
  ].filter(Boolean);

  const clearAll = () => setParams(openId ? { open: openId } : {});

  return (
    <div className={styles.page}>
      <div className={styles.filters}>
        <label className={styles.search}>
          <Search size={14} strokeWidth={1.5} aria-hidden className={styles.searchIcon} />
          <span className="visually-hidden">Search messages</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
            placeholder="Search text, sender, summary"
          />
          {!search && <Kbd>/</Kbd>}
        </label>
        <FilterDropdown
          label="Status"
          value={status}
          onChange={(v) => setParam('status', v)}
          options={STATUSES.map((s) => ({ value: s.value, label: s.label, dot: s.color, count: stats[s.value] ?? 0 }))}
        />
        <FilterDropdown
          label="Category"
          value={category}
          onChange={(v) => setParam('category', v)}
          onOpen={loadCategoryCounts}
          options={CATEGORIES.map((c) => ({ value: c.value, label: c.value, dot: c.color, count: categoryCounts[c.value] }))}
        />
        <span className={`mono ${styles.total}`}>{list.loading ? '' : `${list.total} messages`}</span>
      </div>

      {filters.length > 0 && (
        <div className={styles.chips}>
          {filters.map((f) => (
            <Chip key={f.key} onRemove={() => setParam(f.key, null)} removeLabel={`Remove ${f.label}`}>
              {f.label}
            </Chip>
          ))}
          <button type="button" className={styles.clear} onClick={clearAll}>
            <X size={12} strokeWidth={1.5} aria-hidden /> Clear
          </button>
        </div>
      )}

      {list.error && <p className={styles.error}>{list.error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <colgroup>
            <col style={{ width: 64 }} />
            <col style={{ width: 160 }} />
            <col />
            <col style={{ width: 160 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Time</th>
              <th>Sender</th>
              <th>Message</th>
              <th>Category</th>
              <th>Confidence</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {list.loading ? (
              <SkeletonRows />
            ) : (
              list.items.map((m) => (
                <Row
                  key={m._id}
                  message={m}
                  now={now}
                  flash={list.flash[m._id]}
                  onOpen={() => setParam('open', m._id)}
                  onRetry={() => retry(m)}
                />
              ))
            )}
          </tbody>
        </table>

        {!list.loading && list.items.length === 0 && (
          <EmptyState
            action={
              filters.length ? (
                <a href="#" onClick={(e) => (e.preventDefault(), clearAll())}>
                  Clear filters
                </a>
              ) : null
            }
          >
            {filters.length ? 'No messages match these filters.' : 'No messages yet. Messages from the selected group will appear here.'}
          </EmptyState>
        )}

        {list.hasMore && !list.loading && (
          <div className={styles.more}>
            <Button onClick={list.loadMore} disabled={list.loadingMore}>
              {list.loadingMore ? 'Loading' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      <Drawer open={Boolean(openId && drawerMessage)} onClose={() => setParam('open', null)} title="Message">
        {drawerMessage && (
          <DrawerContent key={drawerMessage._id} message={drawerMessage} onApprove={approveFromDrawer} onClose={() => setParam('open', null)} />
        )}
      </Drawer>
    </div>
  );
}
