import { Settings as SettingsIcon, Save } from 'lucide-react';

export function Settings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Paramètres</h1>
        <p style={{ color: 'var(--text-muted)' }}>Configuration du dashboard, des imports et des informations du cabinet.</p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <SettingsIcon size={24} color="var(--primary)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Informations du cabinet</h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Nom du cabinet</label>
            <input type="text" className="input" defaultValue="Cabinet Dentaire Cenon" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Adresse email de contact</label>
            <input type="email" className="input" defaultValue="contact@cabinet-cenon.fr" />
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Préférences des imports</h2>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
            <span>Avertir en cas d'import manquant depuis plus de 3 jours</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
            <span>Rapprocher automatiquement les patients Doctolib et LogosW (sur la base du Nom + Prénom)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary)' }} />
            <span>Exiger une validation manuelle pour les écarts de règlement supérieurs à 50€</span>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary"><Save size={18} /> Enregistrer les modifications</button>
      </div>
    </div>
  );
}
