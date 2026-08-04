import { useEffect, useState } from 'react';

function App() {
  const [api, setApi] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setApi(res.ok ? 'ok' : 'error'))
      .catch(() => setApi('error'));
  }, []);

  return (
    <main>
      <h1>Meeting Rooms</h1>
      <p>
        API: {api === 'loading' ? 'checking…' : api === 'ok' ? 'connected' : 'unavailable'}
      </p>
    </main>
  );
}

export default App;
