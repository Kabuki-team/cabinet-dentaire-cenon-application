import { useState, useEffect } from 'react';
import { Search, ChevronRight, ChevronLeft, User, ShieldAlert, CheckCircle2, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDB, saveDB } from '../lib/db';
import { calculateSimilarity } from '../lib/similarity';
import { formatToFrench } from '../lib/dateUtils';


export function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [onlyNonSync, setOnlyNonSync] = useState(false);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, onlyNonSync]);

  useEffect(() => {
    const db = getDB();
    if (!db) return;

    try {
      let conditions = [];
      const args: any[] = [];
      const PAGE_SIZE = 50;
      
      if (searchQuery.trim().length > 0) {
        conditions.push("(p.nom LIKE ? OR p.prenom LIKE ? OR p.nom_doctolib LIKE ? OR p.nom_logosw LIKE ?)");
        const p = `%${searchQuery.trim()}%`;
        args.push(p, p, p, p);
      }

      if (onlyNonSync) {
        conditions.push("(p.dossier_logosw IS NULL OR p.dossier_logosw = '')");
      }

      const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

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
          p.has_warning,
          (SELECT MAX(date) FROM appointments WHERE patient_id = p.id AND statut = 'Vu') as lastConsult,
          (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND statut = 'Vu') as count,
          (SELECT SUM(montant_acte) FROM clinical_acts WHERE patient_id = p.id) as total_prod,
          (SELECT SUM(reglement_somme) FROM clinical_acts WHERE patient_id = p.id) as total_enc,
          p.nom_doctolib,
          p.nom_logosw,
          p.dossier_logosw,
          p.date_naissance,
          p.nom_naissance
        FROM patients p
        ${whereClause}
        ORDER BY count DESC, p.nom ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      `, args);

      if (res.length > 0) {
         setPatients(res[0].values.map(v => {
           const prod = Number(v[6]) || 0;
           const enc = Number(v[7]) || 0;
           const pending = prod - enc;
           const nomDoctolib = v[8] as string;
           const nomLogosw = v[9] as string;
           const currentName = `${v[2] || ''} ${v[1] || ''}`.trim();
           const dob = v[11] as string;
           const nomNaissance = v[12] as string;
           
           let searchHint = "";
           if (searchQuery.trim().length > 0) {
              const q = searchQuery.toLowerCase().trim();
              if (nomDoctolib && nomDoctolib.toLowerCase().includes(q) && !currentName.toLowerCase().includes(q)) {
                 searchHint = `Potentiellement Mme/M. ${nomDoctolib}`;
              } else if (nomLogosw && nomLogosw.toLowerCase().includes(q) && !currentName.toLowerCase().includes(q)) {
                 searchHint = `Potentiellement Mme/M. ${nomLogosw}`;
              }
           }

           // Smart-Match suggestion for non-synced patients
           let suggestion: any = null;
            if (!v[10] && dob) {
              try {
                const candidates = db.exec(`SELECT dossier_id, nom, prenom, nom_complet_norm FROM logosw_dictionary WHERE date_naissance = ?`, [dob]);
                if (candidates.length > 0 && candidates[0].values.length > 0) {
                  const targetName = `${v[1] || ''} ${v[2] || ''} ${nomNaissance || ''}`;
                  let bestS: any = null;
                  let bestScore = 0;
                  candidates[0].values.forEach((lp: any) => {
                    const candName = `${lp[1] || ''} ${lp[2] || ''}`;
                    const score = calculateSimilarity(targetName, candName);
                    if (score > bestScore) {
                      bestScore = score;
                      bestS = { id: lp[0], name: `${lp[1]} ${lp[2]}`.trim(), score };
                    }
                  });
                  
                  if (bestS) {
                    const totalOnDate = candidates[0].values.length;
                    if (totalOnDate === 1 || bestScore >= 30) {
                      suggestion = { ...bestS, name: `Mme/M. ${bestS.name}` };
                    }
                  }
                }
              } catch(e) { console.error("Erreur lors de la recherche de suggestion:", e); }
            }

           return {
             id: v[0],
             name: currentName,
             searchHint,
             has_warning: Number(v[3]) === 1,
             lastConsult: v[4] || 'Aucune',
             count: v[5] || 0,
             total_prod: prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }),
             total_enc: enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }),
             pending: pending > 0 ? pending.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'À jour',
             dossier_logosw: v[10],
             suggestion
           };
         }));
      } else {
         setPatients([]);
      }
    } catch (e) { console.error("Erreur chargement patients:", e); }
  }, [searchQuery, page, onlyNonSync]);

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
          <div style={{ position: 'relative', width: '350px' }}>
            <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input 
              className="input" 
              style={{ paddingLeft: '3rem' }} 
              placeholder="Rechercher un patient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            className={`btn ${onlyNonSync ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setOnlyNonSync(!onlyNonSync)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <ShieldAlert size={18} />
            {onlyNonSync ? 'Afficher tous' : 'Voir les anomalies (Non Sync)'}
          </button>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: '0 0 0.5rem 0.5rem', maxHeight: '600px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                {onlyNonSync && <th>Suggestion LogosW</th>}
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
                <tr><td colSpan={onlyNonSync ? 8 : 7} style={{ textAlign: 'center', padding: '2rem' }}>Aucun patient trouvé correspondant à '{searchQuery}'.</td></tr>
              ) : (
                patients.map((patient: any, i: number) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${patient.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', backgroundColor: 'var(--primary-light)', borderRadius: '50%', color: 'var(--primary)' }}>
                          <User size={16} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                             <span style={{ fontWeight: 600 }}>{patient.name}</span>
                             {!patient.dossier_logosw && (
                               <span style={{ 
                                 fontSize: '0.65rem', 
                                 backgroundColor: '#fffbeb', 
                                 color: '#92400e', 
                                 padding: '2px 6px', 
                                 borderRadius: '4px', 
                                 border: '1px solid #fde68a',
                                 fontWeight: 700
                               }}>NON SYNC</span>
                             )}
                             {patient.has_warning && (
                               <div title="Incohérence d'identité détectée entre Doctolib et LogosW" style={{ color: 'var(--danger-text)', display: 'flex', alignItems: 'center' }}>
                                 <ShieldAlert size={16} />
                               </div>
                             )}
                           </div>
                           {patient.searchHint && (
                             <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                               {patient.searchHint}
                             </span>
                           )}
                        </div>
                      </div>
                    </td>
                    {onlyNonSync && (
                      <td onClick={e => e.stopPropagation()}>
                        {patient.suggestion ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: patient.suggestion.score >= 80 ? '#dcfce7' : patient.suggestion.score >= 50 ? '#fef9c3' : '#fee2e2',
                                color: patient.suggestion.score >= 80 ? '#166534' : patient.suggestion.score >= 50 ? '#854d0e' : '#991b1b',
                              }}>{patient.suggestion.score}%</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Potentiellement <strong>{patient.suggestion.name}</strong></span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              <span>Dossier #{patient.suggestion.id}</span>
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '1px 6px', fontSize: '0.65rem', lineHeight: 1.5 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const db = getDB();
                                  if (!db) return;
                                  db.run('UPDATE patients SET dossier_logosw = ?, nom_logosw = ?, has_warning = 0 WHERE id = ?', [patient.suggestion.id, patient.suggestion.name, patient.id]);
                                  await saveDB();
                                  window.location.reload();
                                }}
                              >
                                <Link2 size={10} /> Confirmer le lien
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune suggestion</span>
                        )}
                      </td>
                    )}
                    <td>{patient.lastConsult === 'Aucune' ? 'Aucune' : formatToFrench(patient.lastConsult)}</td>
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
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Page <strong>{page}</strong> sur <strong>{totalPages}</strong> ({totalCount} patients)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
                 <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Aller à :</span>
                 <select 
                   value={page} 
                   onChange={(e) => setPage(Number(e.target.value))}
                   style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)', fontSize: '0.875rem', backgroundColor: 'white' }}
                 >
                   {Array.from({ length: totalPages }).map((_, i) => (
                     <option key={i+1} value={i+1}>Page {i+1}</option>
                   ))}
                 </select>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <button 
                className="btn btn-ghost" 
                style={{ padding: '0.5rem' }}
                disabled={page === 1} 
                onClick={() => setPage(1)}
              >
                <ChevronLeft size={16} />
                <ChevronLeft size={16} style={{ marginLeft: '-10px' }} />
              </button>
              <button 
                className="btn btn-outline" 
                disabled={page === 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Précédent
              </button>

              <div style={{ display: 'flex', gap: '0.25rem', margin: '0 0.5rem' }}>
                 {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum = page;
                    if (page <= 3) pageNum = i + 1;
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = page - 2 + i;
                    
                    if (pageNum < 1 || pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        style={{
                          width: '36px',
                          height: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--border)',
                          backgroundColor: page === pageNum ? 'var(--primary)' : 'white',
                          color: page === pageNum ? 'white' : 'var(--text)',
                          fontWeight: page === pageNum ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                 })}
              </div>

              <button 
                className="btn btn-outline" 
                disabled={page === totalPages} 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Suivant
              </button>
              <button 
                className="btn btn-ghost" 
                style={{ padding: '0.5rem' }}
                disabled={page === totalPages} 
                onClick={() => setPage(totalPages)}
              >
                <ChevronRight size={16} style={{ marginRight: '-10px' }} />
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
