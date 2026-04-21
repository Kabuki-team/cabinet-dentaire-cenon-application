import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type Phase = 'idle' | 'available' | 'downloading' | 'ready' | 'error' | 'dismissed';

export function UpdateNotifier() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await check();
        if (result) {
          setUpdate(result);
          setPhase('available');
        }
      } catch (e) {
        console.warn('Updater check failed (ignoré si dev ou hors Tauri):', e);
      }
    })();
  }, []);

  const handleInstall = async () => {
    if (!update) return;
    setPhase('downloading');
    setErrorMsg(null);
    try {
      let total: number | null = null;
      let downloaded = 0;
      await update.downloadAndInstall((evt) => {
        if (evt.event === 'Started') {
          total = evt.data.contentLength ?? null;
          setProgress({ downloaded: 0, total });
        } else if (evt.event === 'Progress') {
          downloaded += evt.data.chunkLength;
          setProgress({ downloaded, total });
        } else if (evt.event === 'Finished') {
          setPhase('ready');
        }
      });
      await relaunch();
    } catch (e: any) {
      setErrorMsg(String(e?.message || e));
      setPhase('error');
    }
  };

  if (phase === 'idle' || phase === 'dismissed' || !update) return null;

  const pct = progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 100,
        width: 'min(360px, calc(100vw - 2.5rem))',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        boxShadow: 'var(--shadow-md, 0 10px 30px rgba(0,0,0,0.12))',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Download size={18} color="var(--primary)" />
          <strong style={{ fontSize: '0.95rem' }}>
            {phase === 'ready' ? 'Mise à jour prête' : `Mise à jour disponible — v${update.version}`}
          </strong>
        </div>
        {phase !== 'downloading' && (
          <button
            onClick={() => setPhase('dismissed')}
            aria-label="Fermer"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {phase === 'available' && (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Une nouvelle version ({update.version}) du dashboard est disponible.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setPhase('dismissed')} style={{ fontSize: '0.8rem' }}>
              Plus tard
            </button>
            <button className="btn btn-primary" onClick={handleInstall} style={{ fontSize: '0.8rem' }}>
              Installer maintenant
            </button>
          </div>
        </>
      )}

      {phase === 'downloading' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="spin" />
            {pct !== null ? `Téléchargement… ${pct}%` : 'Téléchargement en cours…'}
          </div>
          {pct !== null && (
            <div style={{ height: '4px', background: 'var(--bg)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', transition: 'width 0.2s' }} />
            </div>
          )}
        </>
      )}

      {phase === 'ready' && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Redémarrage de l'application en cours…
        </p>
      )}

      {phase === 'error' && (
        <p style={{ fontSize: '0.8rem', color: 'var(--danger-text)', margin: 0 }}>
          Échec de la mise à jour : {errorMsg}
        </p>
      )}
    </div>
  );
}
