const TONES = {
  Incident: 'red',
  'Change Request': 'amber',
  'Resource Update': 'blue',
  Question: 'purple',
  'Routine Update': 'green',
  Irrelevant: 'grey',
};

export default function CategoryTag({ category }) {
  if (!category) return <span className="muted">—</span>;
  return <span className={`badge badge-${TONES[category] ?? 'grey'}`}>{category}</span>;
}
