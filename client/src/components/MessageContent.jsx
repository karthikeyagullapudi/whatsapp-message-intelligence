import { messagesApi } from '../api/messages.js';

// Original message: text, or image + caption. `compact` = table thumbnail.
export default function MessageContent({ message, compact = false }) {
  const hasImage = message.type === 'image' && message.media?.path;
  return (
    <div className={compact ? 'msg-compact' : 'msg-full'}>
      {hasImage && (
        <a href={messagesApi.mediaUrl(message._id)} target="_blank" rel="noreferrer">
          <img src={messagesApi.mediaUrl(message._id)} alt="attachment" className={compact ? 'thumb' : 'photo'} loading="lazy" />
        </a>
      )}
      {message.type === 'image' && message.media?.error && (
        <span className="error small">Image unavailable: {message.media.error}</span>
      )}
      {message.type === 'unsupported' && <span className="muted small">[{message.waType} message, not processed]</span>}
      {message.body ? (
        <span className="msg-text">{message.body}</span>
      ) : (
        message.type === 'image' && <span className="muted small">(no caption)</span>
      )}
    </div>
  );
}
