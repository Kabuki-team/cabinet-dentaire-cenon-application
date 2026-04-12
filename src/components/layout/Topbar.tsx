import { Bell, Calendar, UserCircle, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function Topbar() {
  const today = new Date();

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Dashboard interne</h2>
        <span className="badge badge-info" style={{ display: 'flex', gap: '0.5rem' }}>
          <Calendar size={14} />
          {format(today, 'dd MMMM yyyy', { locale: fr })}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
          Données à jour (Il y a 2h)
        </div>
        
        <button style={{ position: 'relative', color: 'var(--text-muted)' }}>
          <Bell size={20} />
          <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', backgroundColor: 'var(--danger)', borderRadius: '50%' }}></span>
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: '1.5rem', borderLeft: '1px solid var(--border)' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>Dr. R. MECHOUK</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Administrateur</div>
          </div>
          <UserCircle size={32} color="var(--primary)" />
        </div>

        <button 
          onClick={() => window.location.href = '/login'}
          title="Déconnexion"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', color: 'var(--text-muted)', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
          className="hover:text-danger"
        >
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
