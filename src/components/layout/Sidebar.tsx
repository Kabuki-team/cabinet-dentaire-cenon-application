import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Activity, 
  Users, 
  TrendingUp, 
  UploadCloud, 
  Settings, 
  Shield 
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Vue d\'ensemble' },
  { to: '/imports', icon: UploadCloud, label: 'Imports' },
  { to: '/activity', icon: Activity, label: 'Activité quotidienne' },
  { to: '/patients', icon: Users, label: 'Patients' },
  { to: '/revenues', icon: TrendingUp, label: 'Revenus & analyses' },
  { to: '/users', icon: Shield, label: 'Utilisateurs' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img 
          src="https://cabinet-dentaire-cenon.fr/assets/logo-1SKykJd2.png" 
          alt="Cabinet Dentaire Cenon" 
          style={{ height: '36px', objectFit: 'contain' }} 
        />
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text)' }}>Cabinet Cenon</h1>
      </div>
      
      <nav style={{ padding: '1rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              backgroundColor: isActive ? 'var(--primary-light)' : 'transparent',
              fontWeight: isActive ? 500 : 400,
              textDecoration: 'none',
              transition: 'all 0.2s'
            })}
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--text-muted)' }}>
           Se déconnecter
        </button>
      </div>
    </aside>
  );
}
