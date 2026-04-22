import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { isOffline } from '../lib/db';

export function OfflineBanner() {
  const [offline, setOffline] = useState<boolean>(isOffline());

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('db-offline', onOffline);
    window.addEventListener('db-online', onOnline);
    return () => {
      window.removeEventListener('db-offline', onOffline);
      window.removeEventListener('db-online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'var(--danger-bg, #fee2e2)',
        color: 'var(--danger-text, #991b1b)',
        borderBottom: '1px solid var(--danger, #dc2626)',
        padding: '0.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <WifiOff size={16} />
      <span>
        Serveur cabinet injoignable. Lecture sur cache local ; les modifications ne seront pas
        sauvegardées.
      </span>
    </div>
  );
}
