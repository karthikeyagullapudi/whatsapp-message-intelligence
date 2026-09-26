import { useState } from 'react';
import { ChevronRight, ImageOff } from 'lucide-react';
import { messagesApi } from '../../api/messages.js';
import { absoluteTime, phoneFromId } from '../../lib/format.js';
import { describeReviewReasons } from '../../lib/categories.js';
import Lightbox from '../ui/Lightbox.jsx';
import StatusLabel from './StatusLabel.jsx';
import ReviewForm from './ReviewForm.jsx';
import styles from './MessageDetail.module.css';

const REVIEWABLE = ['needs_review', 'auto_approved', 'approved', 'failed'];

// Original message + review reasons + editable form + AI reasoning.
// Used by the Inbox right pane and the All messages drawer. `footer` holds the actions.
export default function MessageDetail({ message, draft, setDraft, summaryRef, showKeys, footer }) {
  const [lightbox, setLightbox] = useState(false);
  const imageUrl = message.media?.path && !message.media.error ? messagesApi.mediaUrl(message) : null;
  const reasons = describeReviewReasons(message);
  const reviewable = REVIEWABLE.includes(message.processing.status);
  const ai = message.ai;

  return (
    <div className={styles.detail}>
      <div className={styles.scroll}>
        <header className={styles.header}>
          <div className={styles.who}>
            <span className={styles.sender}>{message.senderName || phoneFromId(message.senderId) || 'Unknown sender'}</span>
            <span className={`mono ${styles.meta}`}>{phoneFromId(message.senderId)}</span>
          </div>
          <div className={styles.metaRow}>
            <span>{message.groupName}</span>
            <span className={styles.sep}>·</span>
            <span className="mono">{absoluteTime(message.timestamp)}</span>
            {message.source === 'backfill' && (
              <>
                <span className={styles.sep}>·</span>
                <span>recovered after reconnect</span>
              </>
            )}
            <span className={styles.status}>
              <StatusLabel processing={message.processing} />
            </span>
          </div>
        </header>

        <blockquote className={styles.quote}>
          {imageUrl && (
            <button type="button" className={styles.thumbButton} onClick={() => setLightbox(true)} aria-label="Open image">
              <img src={imageUrl} alt="" className={styles.thumb} />
            </button>
          )}
          {message.type === 'image' && message.media?.error && (
            <p className={styles.mediaError}>
              <ImageOff size={14} strokeWidth={1.5} aria-hidden /> Image unavailable: {message.media.error}
            </p>
          )}
          {message.type === 'unsupported' ? (
            <p className={styles.faint}>{message.waType} message, not processed</p>
          ) : message.body ? (
            <p className={styles.body}>{message.body}</p>
          ) : (
            <p className={styles.faint}>No caption</p>
          )}
        </blockquote>

        {message.duplicateOf && <p className={styles.note}>Duplicate of an earlier message, not sent to the AI.</p>}
        {message.processing.status === 'failed' && <p className={styles.error}>{message.processing.lastError}</p>}
        {reasons && <p className={styles.reasons}>{reasons}</p>}
        {ai?.validationErrors?.length > 0 && <p className={styles.error}>{ai.validationErrors.join(' · ')}</p>}

        {reviewable ? (
          <ReviewForm message={message} draft={draft} setDraft={setDraft} summaryRef={summaryRef} showKeys={showKeys} />
        ) : (
          <p className={styles.note}>
            {message.processing.status === 'skipped'
              ? 'Not sent to the AI, so there is nothing to review.'
              : 'Waiting for the AI. The result will appear here.'}
          </p>
        )}

        {ai && (ai.reasoning || ai.model) && (
          <details className={styles.why}>
            <summary>
              <ChevronRight size={14} strokeWidth={1.5} className={styles.chevron} aria-hidden />
              Why the AI chose this
            </summary>
            <div className={styles.whyBody}>
              {ai.reasoning && <p>{ai.reasoning}</p>}
              <p className={`mono ${styles.meta}`}>
                {[ai.model, ai.promptVersion && `prompt ${ai.promptVersion}`, ai.latencyMs && `${ai.latencyMs} ms`, typeof ai.confidence === 'number' && `confidence ${ai.confidence.toFixed(2)}`, ai.repaired && 'repaired']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {ai.warnings?.length > 0 && <p className={styles.meta}>Adjusted: {ai.warnings.join('; ')}</p>}
            </div>
          </details>
        )}

        {message.review && (
          <p className={styles.meta}>
            Reviewed by {message.review.reviewedBy} · <span className="mono">{absoluteTime(message.review.reviewedAt)}</span>
            {message.review.changedFields?.length > 0 && ` · changed ${message.review.changedFields.join(', ')}`}
          </p>
        )}
      </div>

      {reviewable && footer && <footer className={styles.footer}>{footer}</footer>}
      {lightbox && <Lightbox src={imageUrl} onClose={() => setLightbox(false)} />}
    </div>
  );
}
