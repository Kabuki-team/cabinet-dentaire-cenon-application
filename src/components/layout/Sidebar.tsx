import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Users,
  TrendingUp,
  UploadCloud,
  AlertCircle,
  LogOut,
} from 'lucide-react';

const navSections = [
  {
    label: null,
    items: [
      { to: '/',         icon: LayoutDashboard, label: 'Vue d\'ensemble',     end: true },
      { to: '/activity', icon: Activity,        label: 'Activité' },
      { to: '/patients', icon: Users,           label: 'Patients' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/revenues',     icon: TrendingUp,  label: 'Revenus' },
      { to: '/recouvrement', icon: AlertCircle, label: 'Recouvrement' },
    ],
  },
  {
    label: 'Données',
    items: [
      { to: '/imports', icon: UploadCloud, label: 'Imports' },
    ],
  },
];

export function Sidebar() {
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-wrapper">
          <img
            src="https://cabinet-dentaire-cenon.fr/assets/logo-1SKykJd2.png"
            alt="Cabinet Dentaire Cenon"
            className="sidebar-logo-image"
          />
        </div>
        <div>
          <div className="sidebar-brand-name">Cabinet Dentaire Cenon</div>
          <div className="sidebar-brand-sub">Espace praticien</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.label && <div className="sidebar-section-label">{section.label}</div>}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  'sidebar-link' + (isActive ? ' active' : '')
                }
              >
                <item.icon size={17} className="sidebar-link-icon" strokeWidth={1.75} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          onClick={() => navigate('/login')}
          className="sidebar-link"
          style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
        >
          <LogOut size={16} className="sidebar-link-icon" strokeWidth={1.75} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
