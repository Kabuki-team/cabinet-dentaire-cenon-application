import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initDB } from './lib/db'
import { Loader2 } from 'lucide-react'

function Root() {
  const [init, setInit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDB()
      .then(() => setInit(true))
      .catch(err => {
        console.error(err);
        setError("Erreur de chargement de la base de données locale.");
      });
  }, []);

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: 'var(--danger-text)' }}>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} className="btn btn-outline">Réessayer</button>
      </div>
    );
  }

  if (!init) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={48} color="var(--primary)" />
        <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Initialisation sécurisée du Dashboard...</p>
      </div>
    );
  }

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />)
