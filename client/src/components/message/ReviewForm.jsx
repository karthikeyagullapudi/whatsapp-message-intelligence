import SegmentedControl from '../ui/SegmentedControl.jsx';
import Toggle from '../ui/Toggle.jsx';
import ChipInput from '../ui/ChipInput.jsx';
import { CATEGORIES, PRIORITIES } from '../../lib/categories.js';
import styles from './ReviewForm.module.css';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// "40 bags cement" → { name: 'cement', quantity: 40, unit: 'bags' }; "Pump 3" → { name: 'Pump 3' }
function parseResource(text) {
  const m = text.match(/^(\d+(?:\.\d+)?)\s+(\S+)\s+(.+)$/);
  if (m) return { name: m[3].trim(), quantity: Number(m[1]), unit: m[2] };
  const n = text.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (n) return { name: n[2].trim(), quantity: Number(n[1]), unit: null };
  return { name: text, quantity: null, unit: null };
}
const formatResource = (r) => [r.quantity, r.unit, r.name].filter((v) => v != null && v !== '').join(' ');

const show = {
  category: (v) => v || '–',
  priority: (v) => v,
  actionRequired: (v) => (v ? 'Action required' : 'No action'),
  summary: (v) => v || '–',
  list: (v) => (v?.length ? v.join(', ') : 'none'),
  location: (v) => v || 'none',
  resources: (v) => (v?.length ? v.map(formatResource).join(', ') : 'none'),
};

// A labelled field. When the value differs from the AI's, it gets an "edited"
// tag and the AI's original value is shown faintly underneath.
function Field({ label, htmlFor, edited, original, children, inline = false }) {
  return (
    <div className={`${styles.field} ${inline ? styles.inline : ''}`}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
        {edited && <span className={styles.edited}>edited</span>}
      </div>
      <div className={styles.control}>{children}</div>
      {edited && <p className={styles.original}>AI: {original}</p>}
    </div>
  );
}

export default function ReviewForm({ message, draft, setDraft, summaryRef, showKeys = false }) {
  const ai = message.ai?.category ? message.ai : null;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setEntity = (patch) => setDraft((d) => ({ ...d, entities: { ...d.entities, ...patch } }));
  const changed = (field, value) => Boolean(ai) && !same(ai[field], value);
  const changedEntity = (field, value) => Boolean(ai) && !same(ai.entities?.[field] ?? (field === 'location' ? null : []), value);
  const e = draft.entities;
  const id = message._id;

  return (
    <div className={styles.form}>
      <Field label="Category" edited={changed('category', draft.category)} original={show.category(ai?.category)}>
        <SegmentedControl
          label="Category"
          wrap
          value={draft.category}
          onChange={(category) => set({ category })}
          options={CATEGORIES.map((c) => ({ value: c.value, label: c.value, dot: c.color, hint: showKeys ? c.key : undefined }))}
        />
      </Field>

      <div className={styles.row}>
        <Field label="Priority" edited={changed('priority', draft.priority)} original={show.priority(ai?.priority)}>
          <SegmentedControl
            label="Priority"
            value={draft.priority}
            onChange={(priority) => set({ priority })}
            options={PRIORITIES}
          />
        </Field>
        <Field label="Action" htmlFor={`action-${id}`} edited={changed('actionRequired', draft.actionRequired)} original={show.actionRequired(ai?.actionRequired)}>
          <Toggle id={`action-${id}`} checked={draft.actionRequired} onChange={(actionRequired) => set({ actionRequired })} label="Action required" />
        </Field>
      </div>

      <Field label="Summary" htmlFor={`summary-${id}`} edited={changed('summary', draft.summary)} original={show.summary(ai?.summary)}>
        <textarea
          id={`summary-${id}`}
          ref={summaryRef}
          className={styles.textarea}
          rows={2}
          maxLength={200}
          value={draft.summary}
          onChange={(ev) => set({ summary: ev.target.value })}
          onKeyDown={(ev) => ev.key === 'Escape' && ev.currentTarget.blur()}
        />
      </Field>

      <div className={styles.entities}>
        <Field label="Location" htmlFor={`loc-${id}`} edited={changedEntity('location', e.location || null)} original={show.location(ai?.entities?.location)}>
          <ChipInput
            id={`loc-${id}`}
            max={1}
            values={e.location ? [e.location] : []}
            onChange={(v) => setEntity({ location: v[0] ?? null })}
            placeholder="Add location"
          />
        </Field>
        <Field label="People" htmlFor={`people-${id}`} edited={changedEntity('people', e.people)} original={show.list(ai?.entities?.people)}>
          <ChipInput id={`people-${id}`} values={e.people} onChange={(people) => setEntity({ people })} placeholder="Add name" />
        </Field>
        <Field label="Dates" htmlFor={`dates-${id}`} edited={changedEntity('dates', e.dates)} original={show.list(ai?.entities?.dates)}>
          <ChipInput
            id={`dates-${id}`}
            values={e.dates}
            onChange={(dates) => setEntity({ dates })}
            isValid={(d) => ISO_DATE.test(d)}
            placeholder="YYYY-MM-DD or YYYY-MM-DDTHH:mm"
          />
        </Field>
        <Field label="Resources" htmlFor={`res-${id}`} edited={changedEntity('resources', e.resources)} original={show.resources(ai?.entities?.resources)}>
          <ChipInput
            id={`res-${id}`}
            values={e.resources}
            onChange={(resources) => setEntity({ resources })}
            parse={parseResource}
            format={formatResource}
            placeholder="e.g. 40 bags cement"
          />
        </Field>
      </div>
    </div>
  );
}
