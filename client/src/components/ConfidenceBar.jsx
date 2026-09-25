export default function ConfidenceBar({ value, threshold = 0.75 }) {
  if (typeof value !== 'number') return <span className="muted">—</span>;
  const pct = Math.round(value * 100);
  return (
    <span className="confidence" title={`AI confidence ${pct}%`}>
      <span className="confidence-track">
        <span className={`confidence-fill ${value < threshold ? 'low' : ''}`} style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}
