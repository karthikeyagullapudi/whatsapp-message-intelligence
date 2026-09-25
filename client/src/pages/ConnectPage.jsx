import { useCallback, useEffect, useState } from 'react';
import { whatsappApi } from '../api/whatsapp.js';
import { useSocketConnected, useSocketEvent } from '../hooks/useSocket.js';
import StatusBadge from '../components/StatusBadge.jsx';

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString() : null;
}

export default function ConnectPage() {
  const [status, setStatus] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const socketConnected = useSocketConnected();

  // Initial load; after that the socket keeps the status fresh.
  useEffect(() => {
    whatsappApi.status().then(setStatus).catch((e) => setError(e.message));
  }, []);
  useSocketEvent('wa:state', setStatus);

  const ready = status?.state === 'ready';

  const loadGroups = useCallback(async () => {
    try {
      const { groups } = await whatsappApi.groups();
      setGroups(groups);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Load groups as soon as WhatsApp becomes ready.
  useEffect(() => {
    if (ready) loadGroups();
  }, [ready, loadGroups]);

  useEffect(() => {
    if (status?.selectedGroup) setGroupId(status.selectedGroup.id);
  }, [status?.selectedGroup]);

  async function run(action, successMessage) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const saveGroup = () =>
    run(async () => {
      const { selectedGroup } = await whatsappApi.selectGroup(groupId);
      setStatus((s) => ({ ...s, selectedGroup }));
    }, 'Group saved. New messages from this group will now be captured.');

  const logout = () => {
    if (!window.confirm('Unlink this WhatsApp account? You will need to scan a new QR code.')) return;
    run(async () => {
      setStatus(await whatsappApi.logout());
      setGroups([]);
      setGroupId('');
    }, 'Logged out.');
  };

  return (
    <section className="stack">
      <h2>Connect WhatsApp</h2>

      {!socketConnected && <p className="banner banner-red">Lost connection to the server. Retrying…</p>}
      {error && <p className="banner banner-red">{error}</p>}
      {notice && <p className="banner banner-green">{notice}</p>}

      <div className="card stack">
        <div className="row">
          <strong>Status:</strong> <StatusBadge state={status?.state} />
          {status?.account && (
            <span className="muted">
              as {status.account.name} ({status.account.id?.split('@')[0]})
            </span>
          )}
        </div>

        {status?.loadingPercent && status.state !== 'ready' && (
          <p className="muted">Loading WhatsApp Web… {status.loadingPercent}%</p>
        )}
        {status?.waState && status.waState !== 'CONNECTED' && ready && (
          <p className="muted">WhatsApp reports: {status.waState} (phone may be offline, reconnecting automatically)</p>
        )}
        {status?.lastError && status.state !== 'ready' && (
          <p className="error">
            {status.lastError}
            {status.nextRetryAt && <> — retrying at {formatTime(status.nextRetryAt)}</>}
          </p>
        )}

        {status?.state === 'qr' && status.qr && (
          <div className="qr">
            <img src={status.qr} alt="WhatsApp QR code" width="280" height="280" />
            <ol className="muted">
              <li>Open WhatsApp on your phone</li>
              <li>Settings → Linked devices → Link a device</li>
              <li>Scan this code</li>
            </ol>
          </div>
        )}

        {ready && (
          <p className="muted">
            {status.sessionSavedAt
              ? `Session backed up at ${formatTime(status.sessionSavedAt)}; restarting the server will not ask for a QR again.`
              : 'First login: the session is backed up about 1 minute after connecting. Wait for that before restarting the server.'}
          </p>
        )}
      </div>

      {ready && (
        <div className="card stack">
          <h3>Group to listen to</h3>
          <div className="row">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy}>
              <option value="">— choose a group —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.participants ? ` (${g.participants})` : ''}
                </option>
              ))}
            </select>
            <button onClick={saveGroup} disabled={busy || !groupId || groupId === status.selectedGroup?.id}>
              Save
            </button>
            <button className="secondary" onClick={loadGroups} disabled={busy}>
              Refresh
            </button>
          </div>
          <p className="muted">
            {status.selectedGroup
              ? `Currently listening to: ${status.selectedGroup.name}`
              : 'No group selected yet; no messages are being captured.'}
          </p>
        </div>
      )}

      {status && status.state !== 'stopped' && (
        <div>
          <button className="danger" onClick={logout} disabled={busy}>
            Log out / unlink device
          </button>
        </div>
      )}
    </section>
  );
}
