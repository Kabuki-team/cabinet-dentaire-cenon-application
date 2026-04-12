import { useState } from 'react';
import { Search, Plus, UserCircle, Edit2, Shield, Trash2, X } from 'lucide-react';

export function Users() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Gestion des utilisateurs</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gérez les accès et les rôles au sein du cabinet.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Créer un utilisateur
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" className="input" placeholder="Rechercher par nom ou email..." style={{ paddingLeft: '2.25rem' }} />
          </div>
          <select className="input" style={{ width: 'auto' }}>
            <option value="">Tous les rôles</option>
            <option value="admin">Administrateur</option>
            <option value="praticien">Praticien</option>
            <option value="assistante">Assistante</option>
          </select>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: '0 0 0.5rem 0.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Dernière connexion</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Dr. Reda MECHOUK', email: 'r.mechouk@cabinet-cenon.fr', role: 'Administrateur', status: 'Actif', lastLogin: "Aujourd'hui, 08:00" },
                { name: 'Dr. Jean LABORDE BARBANEGRE', email: 'j.laborde@cabinet-cenon.fr', role: 'Praticien', status: 'Actif', lastLogin: "Aujourd'hui, 09:15" },
                { name: 'Dr. Medy FAKRELDIN', email: 'm.fakreldin@cabinet-cenon.fr', role: 'Praticien', status: 'Actif', lastLogin: "Il y a 2 heures" },
                { name: 'Dr. Hamza GAFSI', email: 'h.gafsi@cabinet-cenon.fr', role: 'Praticien', status: 'Actif', lastLogin: 'Hier, 18:30' },
                { name: 'Dr. Benoit SAY-LIANG-FAT', email: 'b.sayliangfat@cabinet-cenon.fr', role: 'Praticien', status: 'Actif', lastLogin: 'Hier, 14:20' },
              ].map((user, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                       <UserCircle size={32} color={user.status === 'Actif' ? 'var(--primary)' : 'var(--text-muted)'} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{user.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {user.role === 'Administrateur' && <Shield size={16} color="var(--primary)" />}
                      {user.role}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${user.status === 'Actif' ? 'badge-success' : 'badge-danger'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{user.lastLogin}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" style={{ padding: '0.5rem' }}><Edit2 size={16} /></button>
                      <button className="btn btn-ghost" style={{ padding: '0.5rem', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            <button 
              className="btn btn-ghost" 
              style={{ position: 'absolute', top: '1rem', right: '1rem', padding: '0.5rem' }}
              onClick={() => setShowModal(false)}
            >
              <X size={20} />
            </button>
            
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Créer un utilisateur</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Prénom</label>
                  <input type="text" className="input" placeholder="Ex: Jean" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Nom</label>
                  <input type="text" className="input" placeholder="Ex: Dupont" />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Email professionnel</label>
                <input type="email" className="input" placeholder="jean.dupont@cabinet-cenon.fr" />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Rôle</label>
                <select className="input">
                  <option value="praticien">Praticien (Accès à ses vues)</option>
                  <option value="assistante">Assistante (Dashboard & Imports)</option>
                  <option value="admin">Administrateur (Accès complet)</option>
                  <option value="readonly">Consultation simple (Lecture seule)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Mot de passe provisoire</label>
                <input type="text" className="input" value="Bxg92!Kmp" readOnly style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Généré automatiquement. L'utilisateur devra le changer.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={() => setShowModal(false)}>Créer l'utilisateur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
