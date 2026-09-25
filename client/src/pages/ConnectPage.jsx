import { useEffect, useState } from 'react';
import { http } from '../api/http.js';

export default function ConnectPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    http('/health').then(setHealth).catch((e) => setError(e.message));
  }, []);

  return (
    <section>
      <h2>Connect WhatsApp</h2>
      {error && <p className="error">API error: {error}</p>}
      {health && (
        <pre className="card">{JSON.stringify(health, null, 2)}</pre>
      )}
    </section>
  );
}
