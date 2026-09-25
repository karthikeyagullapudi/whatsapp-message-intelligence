const LABELS = {
  pending: ['Pending', 'grey'],
  processing: ['Processing', 'blue'],
  auto_approved: ['Auto-approved', 'green'],
  needs_review: ['Needs review', 'amber'],
  approved: ['Approved', 'green'],
  failed: ['Failed', 'red'],
  skipped: ['Skipped', 'grey'],
};

export default function MessageStatus({ processing }) {
  const [label, tone] = LABELS[processing?.status] ?? [processing?.status, 'grey'];
  const extra = processing?.skipReason === 'duplicate' ? ' (duplicate)' : processing?.skipReason === 'unsupported_type' ? ' (type)' : '';
  return <span className={`badge badge-${tone}`}>{label}{extra}</span>;
}
