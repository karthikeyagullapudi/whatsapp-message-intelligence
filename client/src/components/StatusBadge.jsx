const LABELS = {
  stopped: ['Stopped', 'grey'],
  initializing: ['Starting…', 'blue'],
  qr: ['Waiting for QR scan', 'amber'],
  authenticated: ['Authenticated, loading chats…', 'blue'],
  ready: ['Connected', 'green'],
  disconnected: ['Disconnected', 'red'],
  error: ['Error', 'red'],
};

export default function StatusBadge({ state }) {
  const [label, tone] = LABELS[state] ?? [state ?? 'Unknown', 'grey'];
  return <span className={`badge badge-${tone}`}>{label}</span>;
}
