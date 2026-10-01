import { useEffect, useState } from 'react';
import { APP_NAME } from '@splitbook/shared';

// Placeholder page for M0: proves the client renders and the /api proxy reaches Express.
export default function App() {
  const [apiStatus, setApiStatus] = useState('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setApiStatus(body.status))
      .catch(() => setApiStatus('unreachable'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>{APP_NAME}</h1>
      <p>API: {apiStatus}</p>
    </main>
  );
}
