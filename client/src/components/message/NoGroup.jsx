import { Link } from 'react-router-dom';
import EmptyState from '../ui/EmptyState.jsx';

// Shown instead of messages when no group is selected (e.g. right after a logout),
// so the previous account's messages are never mixed in.
export default function NoGroup({ wa }) {
  return (
    <EmptyState action={<Link to="/connection">Go to Connection</Link>}>
      {wa?.state === 'ready'
        ? 'No group selected. Choose the group to listen to on the Connection page.'
        : 'WhatsApp is not connected. Link your account and choose a group on the Connection page.'}
    </EmptyState>
  );
}
