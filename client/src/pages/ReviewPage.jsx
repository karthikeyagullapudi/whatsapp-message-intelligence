import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { messagesApi } from '../api/messages.js';
import { useMessages } from '../hooks/useMessages.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { REVIEW_REASON_LABELS } from '../constants/categories.js';
import CategoryTag from '../components/CategoryTag.jsx';
import ConfidenceBar from '../components/ConfidenceBar.jsx';
import MessageStatus from '../components/MessageStatus.jsx';
import MessageContent from '../components/MessageContent.jsx';
import ReviewForm from '../components/ReviewForm.jsx';

const REVIEWABLE = ['needs_review', 'auto_approved', 'approved', 'failed'];
const formatTime = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function ReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // The queue: oldest first, so nothing waits forever.
  const queue = useMessages({ status: 'needs_review', sort: 'oldest', limit: 50 });
  const selectedId = id ?? queue.items[0]?._id;

  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!selectedId) return setMessage(null);
    try {
      setMessage(await messagesApi.get(selectedId));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [selectedId]);

  useEffect(() => {
    setNotice(null);
    load();
  }, [load]);

  // If the worker finishes this message while it is open, show the new result.
  useSocketEvent('message:updated', (m) => {
    if (m._id === selectedId && !busy) setMessage(m);
  });

  async function submit(body, { next }) {
    setBusy(true);
    setError(null);
    try {
      const saved = await messagesApi.review(message._id, body);
      setMessage(saved);
      const nextItem = queue.items.find((m) => m._id !== message._id);
      if (next && nextItem) {
        navigate(`/review/${nextItem._id}`);
      } else {
        setNotice(next ? 'Approved. The review queue is empty.' : 'Approved and saved.');
      }
    } catch (e) {
      setError(e.details ? `${e.message}: ${e.details.map((d) => `${d.path} ${d.message}`).join('; ')}` : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review-layout">
      <aside className="card queue">
        <h3>Needs review ({queue.total})</h3>
        {queue.items.length === 0 && <p className="muted">Nothing waiting. 🎉</p>}
        {queue.items.map((m) => (
          <Link key={m._id} to={`/review/${m._id}`} className={`queue-item ${m._id === selectedId ? 'active' : ''}`}>
            <div className="row between">
              <strong className="small">{m.senderName ?? 'unknown'}</strong>
              <CategoryTag category={m.ai?.category} />
            </div>
            <span className="muted small ellipsis">{m.body || (m.type === 'image' ? '📷 image' : '')}</span>
          </Link>
        ))}
      </aside>

      <div className="stack">
        {error && <p className="banner banner-red">{error}</p>}
        {notice && <p className="banner banner-green">{notice}</p>}
        {!message && !error && <p className="muted">Select a message from the queue.</p>}

        {message && (
          <div className="review-grid">
            <div className="card stack">
              <div className="row between">
                <h3>Original message</h3>
                <MessageStatus processing={message.processing} />
              </div>
              <p className="muted small">
                {message.senderName ?? message.senderId} · {message.groupName} · {formatTime(message.timestamp)}
                {message.source === 'backfill' && ' · recovered after reconnect'}
              </p>
              <MessageContent message={message} />
              {message.duplicateOf && (
                <p className="muted small">
                  Duplicate of <Link to={`/review/${message.duplicateOf}`}>an earlier message</Link>, not sent to the AI.
                </p>
              )}

              {message.ai && (
                <div className="ai-box stack small-gap">
                  <h4>AI result</h4>
                  <div className="row">
                    <CategoryTag category={message.ai.category} />
                    <ConfidenceBar value={message.ai.confidence} />
                    {message.ai.priority && <span className="muted small">priority: {message.ai.priority}</span>}
                  </div>
                  {message.ai.reasoning && <p className="small">“{message.ai.reasoning}”</p>}
                  {message.ai.reviewReasons?.length > 0 && (
                    <ul className="small reasons">
                      {message.ai.reviewReasons.map((r) => (
                        <li key={r}>{REVIEW_REASON_LABELS[r] ?? r}</li>
                      ))}
                    </ul>
                  )}
                  {message.ai.validationErrors?.length > 0 && (
                    <div className="error small">Validation errors: {message.ai.validationErrors.join('; ')}</div>
                  )}
                  {message.ai.warnings?.length > 0 && <div className="muted small">Adjusted: {message.ai.warnings.join('; ')}</div>}
                  <span className="muted small">
                    {message.ai.model} · prompt {message.ai.promptVersion} · {message.ai.latencyMs} ms
                    {message.ai.repaired && ' · repaired'}
                  </span>
                </div>
              )}

              {message.review && (
                <p className="muted small">
                  Reviewed by {message.review.reviewedBy} at {formatTime(message.review.reviewedAt)}
                  {message.review.changedFields?.length > 0 && ` · changed: ${message.review.changedFields.join(', ')}`}
                </p>
              )}
            </div>

            <div className="card">
              {REVIEWABLE.includes(message.processing.status) ? (
                <>
                  <h3>{message.review ? 'Edit review' : 'Correct & approve'}</h3>
                  {message.processing.status === 'failed' && (
                    <p className="muted small">The AI failed on this message ({message.processing.lastError}). You can classify it by hand.</p>
                  )}
                  <ReviewForm message={message} busy={busy} onSubmit={submit} />
                </>
              ) : (
                <p className="muted">
                  {message.processing.status === 'skipped'
                    ? 'This message was not sent to the AI (duplicate or unsupported type).'
                    : 'The AI has not processed this message yet. It will appear here when ready.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
