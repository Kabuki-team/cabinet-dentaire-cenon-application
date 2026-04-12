import { useState, useEffect } from 'react';
import { ArrowLeft, Download, UserCircle, Calendar, Clock, Euro, X, ShieldAlert, FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDB } from '../lib/db';

export function PatientDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [selectedAct, setSelectedAct] = useState<any>(null);

  const [patient, setPatient] = useState<any>(null);
  const [acts, setActs] = useState<any[]>([]);

  useEffect(() => {
    const db = getDB();
    if (!db || !id) return;

    try {
      // Info base patient
      const pRes = db.exec(`
        SELECT id, doctolib_id, nom, prenom, date_naissance, telephone, email
        FROM patients 
        WHERE id = ?
      `, [id]);

      if (pRes.length > 0 && pRes[0].values[0]) {
        const v = pRes[0].values[0];
        
        // Stats
        const actRes = db.exec(`
          SELECT SUM(montant_acte), SUM(reglement_somme)
          FROM clinical_acts 
          WHERE patient_id = ?
        `, [id]);
        
        const aRes = db.exec(`
          SELECT MAX(date), praticien
          FROM appointments
          WHERE patient_id = ? AND statut = 'Vu'
        `, [id]);

        let prod = 0, enc = 0;
        if (actRes.length > 0 && actRes[0].values[0]) {
            prod = Number(actRes[0].values[0][0]) || 0;
            enc = Number(actRes[0].values[0][1]) || 0;
        }

        setPatient({
          id: v[0],
          dId: v[1] || 'NC',
          name: `${v[3]} ${v[2]}`.trim(),
          dob: v[4] || 'Inconnue',
          telephone: v[5] || 'Non renseigné',
          email: v[6] || 'Non renseigné',
          lastConsult: aRes[0]?.values[0]?.[0] ? new Date(String(aRes[0].values[0][0])).toLocaleDateString('fr-FR') : 'Aucune',
          praticien: aRes[0]?.values[0]?.[1] || 'Non assigné',
          total_prod: prod,
          total_enc: enc,
          pending: prod - enc
        });

        // Historique des actes
        const hRes = db.exec(`
          SELECT c.id, c.date, c.libelle, c.montant_acte, c.reglement_somme, c.source, c.type,
                 c.logosw_praticien,
                 (SELECT praticien FROM appointments WHERE patient_id = c.patient_id AND date = c.date LIMIT 1) as praticien_appt
          FROM clinical_acts c
          WHERE c.patient_id = ?
          ORDER BY c.date DESC
        `, [id]);

        const MAP_PRATICIENS: Record<string, string> = {
          "RM": "Dr. Réda Mechouk",
          "RMe": "Dr. RMe (Dr Réda Mechouk externe ?)",
          "RMr": "Dr. RMr (Dr Réda Mechouk remplaçant ?)"
        };
        
        const resolvePraticien = (logoswInitials: string | null, doctolibName: string | null) => {
           if (logoswInitials && logoswInitials !== 'NC') {
               return MAP_PRATICIENS[logoswInitials] || `Dr. ${logoswInitials} (LogosW)`;
           }
           return doctolibName || 'Cabinet Dentaire';
        };

        if (hRes.length > 0) {
           setActs(hRes[0].values.map((act: any) => ({
             id: act[0],
             date: act[1] ? new Date(String(act[1])) : null,
             rawDate: act[1],
             libelle: act[2],
             montant: Number(act[3]) || 0,
             reglement: Number(act[4]) || 0,
             source: act[5],
             type: act[6],
             praticien: resolvePraticien(act[7], act[8]),
             logosw_praticien: act[7]
           })).filter((act: any) => !(act.montant === 0 && act.reglement === 0)));
        }
      }
    } catch (e) { console.error("Erreur fiche patient:", e); }
  }, [id]);

  if (!patient) {
     return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement de la fiche patient...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: '0.5rem' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 600 }}>{patient.name}</h1>
            <p style={{ color: 'var(--text-muted)' }}>Dossier interne #{patient.id} • ID Doctolib : {patient.dId}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline"><Download size={18} /> Exporter la fiche</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) 2fr', gap: '1.5rem' }}>
        {/* Colonne Informations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Informations générales</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Praticien habituel</span>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{patient.praticien}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Téléphone</span>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{patient.telephone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Email</span>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{patient.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Date de naissance</span>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{patient.dob}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Dernière visite</span>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{patient.lastConsult}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: 'var(--primary-light)', border: '1px solid var(--primary)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--primary)' }}>Synthèse financière</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--primary)', fontSize: '0.875rem', opacity: 0.8 }}>Total Facturé (Prod)</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{patient.total_prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--primary)', fontSize: '0.875rem', opacity: 0.8 }}>Total Encaissé</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{patient.total_enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--primary)', opacity: 0.8 }}>
                <span style={{ color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 500 }}>Reste à charge</span>
                <span style={{ fontWeight: 600, color: patient.pending > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>
                  {patient.pending > 0 ? patient.pending.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '0,00 €'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne Historique */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: 0 }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Historique des actes & règlements</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 1.5rem 1.5rem 1.5rem', maxHeight: '600px', overflowY: 'auto' }}>
            {acts.length === 0 ? (
               <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <FileText size={48} style={{ marginBottom: '1rem' }} />
                 <p>Aucun acte enregistré dans LogosW pour ce patient.</p>
               </div>
            ) : Object.entries(
               acts.reduce((acc, act) => {
                 const key = act.rawDate || 'NC';
                 if (!acc[key]) acc[key] = [];
                 acc[key].push(act);
                 return acc;
               }, {} as Record<string, any[]>)
            ).map(([_dateStr, dayActs]: [string, any], i) => (
              <div key={i} style={{ padding: '0 0 1.5rem 0', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>
                  <Calendar size={18} />
                  <span style={{ textTransform: 'capitalize' }}>
                    {dayActs[0].date ? dayActs[0].date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date Inconnue'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '1.25rem', borderLeft: '2px solid var(--border)', marginLeft: '0.5rem' }}>
                  {dayActs.map((act: any, j: number) => (
                    <div key={j} style={{ display: 'flex', gap: '1rem', padding: '1rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => { setSelectedAct(act); setShowConsultModal(true); }}>
                      <div style={{ width: '4px', backgroundColor: act.type === 'REGLEMENT' ? 'var(--success-bg)' : 'var(--warning-bg)', borderRadius: '2px' }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <h4 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{act.libelle || 'Acte'}</h4>
                          <span style={{ fontWeight: 600, color: act.type === 'REGLEMENT' ? 'var(--success-text)' : 'var(--text)' }}>
                            {(act.type === 'REGLEMENT' ? act.reglement : act.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{act.type === 'REGLEMENT' ? 'Paiement' : 'Prestation'}</span>
                          <span style={{ fontSize: '0.875rem', color: act.type === 'REGLEMENT' ? 'var(--success-text)' : (act.reglement >= act.montant ? 'var(--success-text)' : 'var(--warning-text)'), fontWeight: 500 }}>
                             {act.type === 'REGLEMENT' ? 'Encaissé' : (act.reglement >= act.montant ? 'Réglé' : '')}
                          </span>
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <ShieldAlert size={12} /> Source: {act.source}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showConsultModal && selectedAct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', zIndex: 50 }}>
          <div style={{ height: '100%', width: '100%', maxWidth: '400px', backgroundColor: 'var(--card)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Détail de l'opération</h2>
              <button className="btn btn-ghost" onClick={() => setShowConsultModal(false)} style={{ padding: '0.5rem' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Praticien responsable</span>
                <div style={{ fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedAct.praticien.replace('Dr. ', '').replace('Docteur ', '')}
                  {selectedAct.logosw_praticien && selectedAct.logosw_praticien !== 'NC' && (
                    <span className="badge" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.7rem' }}>Source : LogosW</span>
                  )}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Date</span>
                <div style={{ fontWeight: 500 }}>{selectedAct.date ? selectedAct.date.toLocaleDateString('fr-FR') : selectedAct.rawDate}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Relevé</span>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>{selectedAct.libelle}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type: {selectedAct.type}</div>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Bilan Financier</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Montant facturé</span>
                    <span style={{ fontWeight: 600 }}>{selectedAct.montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Montant réglé</span>
                    <span style={{ fontWeight: 600, color: 'var(--success-text)' }}>{selectedAct.reglement.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                  </div>
                </div>
              </div>
              <div style={{ padding: '1rem', backgroundColor: 'var(--info-bg)', borderRadius: '0.5rem', marginTop: 'auto' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--info-text)', margin: 0 }}>
                  Ces informations proviennent directement de votre import budgétaire ({selectedAct.source}).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
