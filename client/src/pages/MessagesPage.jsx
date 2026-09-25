import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { messagesApi } from '../api/messages.js';
import { useMessages } from '../hooks/useMessages.js';
import { CATEGORIES, STATUSES, finalResult } from '../constants/categories.js';
import CategoryTag from '../components/CategoryTag.jsx';
import ConfidenceBar from '../components/ConfidenceBar.jsx';
import MessageStatus from '../components/MessageStatus.jsx';
import MessageContent from '../components/MessageContent.jsx';

const formatTime = (d) => new Date(d).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

export default function MessagesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState(null);

  // Wait until typing stops before searching.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, category, q]);

  const { items, total, pages, loading, error } = useMessages({ status, category, q, page, limit: 20 });

  async function retry(e, id) {
    e.stopPropagation();
    setActionError(null);
    try {
      await messagesApi.retry(id);
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <section className="stack">
      <h2>Messages</h2>

      <div className="row card">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input placeholder="Search text, sender, summary…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted">{total} messages</span>
      </div>

      {(error || actionError) && <p className="banner banner-red">{error || actionError}</p>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Sender</th>
              <th>Message</th>
              <th>Category</th>
              <th>Confidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const result = finalResult(m);
              return (
                <tr key={m._id} className="clickable" onClick={() => navigate(`/review/${m._id}`)}>
                  <td className="nowrap">{formatTime(m.timestamp)}</td>
                  <td>{m.senderName ?? m.senderId}</td>
                  <td className="msg-cell">
                    <MessageContent message={m} compact />
                    {result?.summary && <div className="muted small">AI: {result.summary}</div>}
                  </td>
                  <td>
                    <CategoryTag category={result?.category} />
                    {m.review && <div className="muted small">reviewed</div>}
                  </td>
                  <td>
                    <ConfidenceBar value={m.ai?.confidence} />
                  </td>
                  <td>
                    <MessageStatus processing={m.processing} />
                    {m.processing.status === 'failed' && (
                      <div className="stack small-gap">
                        <span className="error small">{m.processing.lastError}</span>
                        <button className="secondary" onClick={(e) => retry(e, m._id)}>
                          Retry
                        </button>
                      </div>
                    )}
                    {m.processing.status === 'pending' && m.processing.lastError && (
                      <div className="muted small">Retrying: {m.processing.lastError}</div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted center">
                  No messages yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="row">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <button className="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
