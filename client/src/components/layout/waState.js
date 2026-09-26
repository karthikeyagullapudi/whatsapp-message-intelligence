// WhatsApp connection state → label + colour token (accent only for "connected").
const MAP = {
  ready: ['Connected', 'var(--accent)'],
  authenticated: ['Syncing', 'var(--warning)'],
  initializing: ['Starting', 'var(--warning)'],
  qr: ['Waiting for scan', 'var(--warning)'],
  disconnected: ['Disconnected', 'var(--danger)'],
  error: ['Error', 'var(--danger)'],
  stopped: ['Stopped', 'var(--text-muted)'],
};

export function waStateInfo(state) {
  const [label, color] = MAP[state] ?? ['Unknown', 'var(--text-muted)'];
  return { label, color };
}
