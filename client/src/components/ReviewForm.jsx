import { useEffect, useState } from 'react';
import { CATEGORIES, PRIORITIES } from '../constants/categories.js';

const EMPTY = {
  category: '',
  summary: '',
  priority: 'low',
  actionRequired: false,
  entities: { location: null, people: [], dates: [], resources: [] },
};

const toList = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Form pre-filled with the AI result (or a previous review). Fields that differ
// from the AI's answer are highlighted, so the reviewer sees what they changed.
export default function ReviewForm({ message, busy, onSubmit }) {
  const ai = message.ai?.category ? message.ai : null;
  const start = message.review ?? ai ?? EMPTY;

  const [form, setForm] = useState(start);
  const [people, setPeople] = useState(start.entities.people.join(', '));
  const [dates, setDates] = useState(start.entities.dates.join(', '));
  const [notes, setNotes] = useState(message.review?.notes ?? '');
  const [reviewedBy, setReviewedBy] = useState(() => localStorage.getItem('reviewer') ?? '');

  useEffect(() => {
    setForm(start);
    setPeople(start.entities.people.join(', '));
    setDates(start.entities.dates.join(', '));
    setNotes(message.review?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message._id]);

  const entities = { ...form.entities, people: toList(people), dates: toList(dates) };
  const changed = (field, value) => ai && !same(ai[field], value);
  const cls = (isChanged) => (isChanged ? 'field changed' : 'field');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setEntity = (patch) => set({ entities: { ...form.entities, ...patch } });
  const setResource = (i, patch) =>
    setEntity({ resources: form.entities.resources.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  function submit(e, next = false) {
    e.preventDefault();
    if (reviewedBy) localStorage.setItem('reviewer', reviewedBy);
    onSubmit(
      {
        category: form.category,
        summary: form.summary,
        priority: form.priority,
        actionRequired: form.actionRequired,
        entities: {
          ...entities,
          location: form.entities.location?.trim() || null,
          resources: form.entities.resources
            .filter((r) => r.name?.trim())
            .map((r) => ({
              name: r.name.trim(),
              quantity: r.quantity === '' || r.quantity == null ? null : Number(r.quantity),
              unit: r.unit?.trim() || null,
            })),
        },
        notes,
        reviewedBy: reviewedBy.trim() || undefined,
      },
      { next },
    );
  }

  return (
    <form className="stack" onSubmit={(e) => submit(e)}>
      <label className={cls(changed('category', form.category))}>
        Category
        <select value={form.category} onChange={(e) => set({ category: e.target.value })} required>
          <option value="">— choose —</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className={cls(changed('summary', form.summary))}>
        Summary
        <textarea rows={2} maxLength={200} value={form.summary} onChange={(e) => set({ summary: e.target.value })} required />
      </label>

      <div className="row">
        <label className={cls(changed('priority', form.priority))}>
          Priority
          <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className={`${cls(changed('actionRequired', form.actionRequired))} checkbox`}>
          <input
            type="checkbox"
            checked={form.actionRequired}
            onChange={(e) => set({ actionRequired: e.target.checked })}
          />
          Action required
        </label>
      </div>

      <fieldset className={cls(changed('entities', { ...entities, location: form.entities.location || null }))}>
        <legend>Extracted details</legend>
        <label>
          Location
          <input value={form.entities.location ?? ''} onChange={(e) => setEntity({ location: e.target.value })} />
        </label>
        <label>
          People (comma separated)
          <input value={people} onChange={(e) => setPeople(e.target.value)} />
        </label>
        <label>
          Dates (ISO, comma separated)
          <input value={dates} onChange={(e) => setDates(e.target.value)} placeholder="2026-09-26T09:00" />
        </label>
        <div className="stack small-gap">
          <span>Resources</span>
          {form.entities.resources.map((r, i) => (
            <div className="row resource-row" key={i}>
              <input placeholder="name" value={r.name ?? ''} onChange={(e) => setResource(i, { name: e.target.value })} />
              <input
                placeholder="qty"
                type="number"
                className="narrow"
                value={r.quantity ?? ''}
                onChange={(e) => setResource(i, { quantity: e.target.value })}
              />
              <input placeholder="unit" className="narrow" value={r.unit ?? ''} onChange={(e) => setResource(i, { unit: e.target.value })} />
              <button
                type="button"
                className="secondary"
                onClick={() => setEntity({ resources: form.entities.resources.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => setEntity({ resources: [...form.entities.resources, { name: '', quantity: null, unit: null }] })}
            >
              + Add resource
            </button>
          </div>
        </div>
      </fieldset>

      <label className="field">
        Reviewer notes
        <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="field">
        Your name
        <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="reviewer" />
      </label>

      <div className="row">
        <button type="submit" disabled={busy}>
          Approve
        </button>
        <button type="button" disabled={busy} onClick={(e) => submit(e, true)}>
          Approve &amp; next
        </button>
        {ai && <span className="muted small">Highlighted fields differ from the AI's answer.</span>}
      </div>
    </form>
  );
}
