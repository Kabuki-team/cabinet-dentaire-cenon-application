import { useState, useEffect } from 'react';
import { Search, ChevronRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDB } from '../lib/db';

export function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    const db = getDB();
    if (!db) return;

    try {
      let whereClause = "";
      const args: any[] = [];
      const PAGE_SIZE = 50;
      
      if (searchQuery.trim().length > 0) {
        whereClause = "WHERE p.nom LIKE ? OR p.prenom LIKE ?";
        const p = `%${searchQuery.trim()}%`;
        args.push(p, p);
      }

      // Count total matches for pagination
      const countRes = db.exec(`SELECT COUNT(*) FROM patients p ${whereClause}`, args);
      const total = countRes.length > 0 ? Number(countRes[0].values[0][0]) : 0;
      setTotalCount(total);
      setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));

      // Fetch current page
      const res = db.exec(`
        SELECT 
          p.id,
          p.nom,
          p.prenom,
          (SELECT MAX(date) FROM appointments WHERE patient_id = p.id AND statut = 'Vu') as lastConsult,
          (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND statut = 'Vu') as count,
          (SELECT SUM(montant_acte) FROM clinical_acts WHERE patient_id = p.id) as total_prod,
          (SELECT SUM(reglement_somme) FROM clinical_acts WHERE patient_id = p.id) as total_enc
        FROM patients p
        ${whereClause}
        ORDER BY count DESC, p.nom ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      `, args);

      if (res.length > 0) {
         setPatients(res[0].values.map(v => {
           const prod = Number(v[5]) || 0;
           const enc = Number(v[6]) || 0;
           const pending = prod - enc;

           return {
             id: v[0],
             name: `${v[2] || ''} ${v[1] || ''}`.trim(),
             lastConsult: v[3] || 'Aucune',
             count: v[4] || 0,
             total_prod: prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }),
             total_enc: enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }),
             pending: pending > 0 ? pending.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'À jour'
           };
         }));
      } else {
         setPatients([]);
      }
    } catch (e) { console.error("Erreur chargement patients:", e); }
  }, [searchQuery, page]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Patients ({totalCount})</h1>
          <p style={{ color: 'var(--text-muted)' }}>Base patient et historique global.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
               type="text" 
               className="input" 
               placeholder="Rechercher un patient par nom ou prénom..." 
               style={{ paddingLeft: '2.25rem' }} 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: '0 0 0.5rem 0.5rem', maxHeight: '600px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Dernière consultation</th>
                <th>Consultations</th>
                <th>Facturé (Prod)</th>
                <th>Payé (Règlement)</th>
                <th>En attente</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Aucun patient trouvé correspondant à '{searchQuery}'.</td></tr>
              ) : (
                patients.map((patient: any, i: number) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${patient.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-light)', borderRadius: '50%', color: 'var(--primary)' }}>
                          <User size={16} />
                        </div>
                        <span style={{ fontWeight: 500 }}>{patient.name}</span>
                      </div>
                    </td>
                    <td>{patient.lastConsult === 'Aucune' ? 'Aucune' : new Date(patient.lastConsult).toLocaleDateString('fr-FR')}</td>
                    <td>{patient.count}</td>
                    <td style={{ fontWeight: 500, color: 'var(--warning-text)' }}>{patient.total_prod}</td>
                    <td style={{ fontWeight: 500, color: 'var(--success-text)' }}>{patient.total_enc}</td>
                    <td>
                      {patient.pending !== 'À jour' ? (
                        <span className="badge badge-warning">{patient.pending}</span>
                      ) : (
                        <span className="badge badge-success">À jour</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }}>
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Page {page} sur {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-outline" 
                disabled={page === 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Précédent
              </button>
              <button 
                className="btn btn-outline" 
                disabled={page === totalPages} 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
