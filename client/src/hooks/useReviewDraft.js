import { useEffect, useState } from 'react';

const EMPTY_ENTITIES = { location: null, people: [], dates: [], resources: [] };

export function draftFrom(message) {
  const src = message?.review ?? (message?.ai?.category ? message.ai : null);
  return {
    category: src?.category ?? '',
    summary: src?.summary ?? '',
    priority: src?.priority ?? 'low',
    actionRequired: src?.actionRequired ?? false,
    entities: { ...EMPTY_ENTITIES, ...(src?.entities ?? {}) },
    notes: message?.review?.notes ?? '',
  };
}

// Editable copy of a message's result. Resets when a different message is shown.
export function useReviewDraft(message) {
  const [draft, setDraft] = useState(() => draftFrom(message));
  useEffect(() => {
    setDraft(draftFrom(message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?._id]);
  return [draft, setDraft];
}

export function toReviewBody(draft) {
  return {
    category: draft.category,
    summary: draft.summary.trim(),
    priority: draft.priority,
    actionRequired: draft.category === 'Irrelevant' ? false : draft.actionRequired,
    entities: {
      location: draft.entities.location?.trim() || null,
      people: draft.entities.people,
      dates: draft.entities.dates,
      resources: draft.entities.resources,
    },
    notes: draft.notes ?? '',
  };
}

export const canApprove = (draft) => Boolean(draft.category && draft.summary.trim());
