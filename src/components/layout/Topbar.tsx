import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Calendar, UserCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getDB } from '../../lib/db';

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/':              { title: 'Vue d\'ensemble',      subtitle: 'Tableau de bord consolidé du cabinet' },
  '/activity':      { title: 'Activité quotidienne', subtitle: 'Journal des actes et rendez-vous' },
  '/patients':      { title: 'Patients',             subtitle: 'Base patients et dossiers' },
  '/revenues':      { title: 'Revenus & analyses',   subtitle: 'Honoraires, encaissements et performance' },
  '/recouvrement':  { title: 'Recouvrement',         subtitle: 'Créances et suivi des impayés' },
  '/imports':       { title: 'Imports',              subtitle: 'Chargement des données Doctolib & LogosW' },
};

export function Topbar() {
  const today = new Date();
  const location = useLocation();
  const [lastImport, setLastImport] = useState<string | null>(null);

  // resolve meta for current path (handles /patients/:id)
  const isPatientDetail = location.pathname.startsWith('/patients/') && location.pathname !== '/patients';
  const pathKey = isPatientDetail ? '/patients' : location.pathname;
  const meta = isPatientDetail
    ? { title: 'Dossier patient', subtitle: 'Historique des actes, rendez-vous et réconciliation' }
    : PAGE_META[pathKey] ?? { title: 'Cabinet Cenon', subtitle: '' };

  useEffect(() => {
    const db = getDB();
    if (!db) return;
    try {
      const res = db.exec("SELECT MAX(timestamp) FROM import_logs");
      if (res.length > 0 && res[0].values[0][0]) {
        const ts = new Date(String(res[0].values[0][0]));
        const diffMin = Math.floor((Date.now() - ts.getTime()) / 60000);
        if (diffMin < 60)        setLastImport(`Il y a ${diffMin} min`);
        else if (diffMin < 1440) setLastImport(`Il y a ${Math.floor(diffMin / 60)}h`);
        else                     setLastImport(`Il y a ${Math.floor(diffMin / 1440)}j`);
      }
    } catch (e) {}
  }, [location.pathname]);

  return (
    <header className="topbar">
      {/* Left — page identity */}
      <div className="topbar-page-title">{meta.title}</div>

      {/* Right — status + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>

        {/* Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <Calendar size={14} strokeWidth={1.75} />
          <span style={{ fontWeight: 500 }}>
            {format(today, 'EEEE dd MMM', { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
          </span>
        </div>

        {/* Sync status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            fontSize: '0.78rem',
            color: lastImport ? 'var(--success-text)' : 'var(--text-faint)',
            background: lastImport ? 'var(--success-bg)' : 'var(--bg-alt)',
            border: `1px solid ${lastImport ? 'var(--success-border)' : 'var(--border)'}`,
            borderRadius: '9999px',
            padding: '0.25rem 0.75rem',
          }}
        >
          <RefreshCw size={11} strokeWidth={2} />
          <span>{lastImport ? `Sync ${lastImport}` : 'Aucun import'}</span>
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)' }}>Dr. R. Mechouk</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>Administrateur</div>
          </div>
          <div style={{
            width: 34, height: 34,
            borderRadius: '50%',
            background: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--border)',
          }}>
            <UserCircle size={20} color="var(--primary)" strokeWidth={1.75} />
          </div>
        </div>

      </div>
    </header>
  );
}
