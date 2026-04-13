import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Calendar, X, ShieldAlert, FileText, CheckCircle2, MessageSquare } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDB, saveDB } from '../lib/db';

export function PatientDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [selectedAct, setSelectedAct] = useState<any>(null);

  const [patient, setPatient] = useState<any>(null);
  const [acts, setActs] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, any>>({});
  const [showAnnotationModal, setShowAnnotationModal] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [comment, setComment] = useState('');
  
  const [isEditingID, setIsEditingID] = useState(false);
  const [tempID, setTempID] = useState('');
  
  const [suggestion, setSuggestion] = useState<any>(null);

  useEffect(() => {
    const db = getDB();
    if (!db || !id) return;

    try {
      // Info base patient
      const pRes = db.exec(`
        SELECT id, doctolib_id, nom, prenom, date_naissance, telephone, email, nom_doctolib, nom_logosw, dossier_logosw, has_warning
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
          dob: v[4] ? new Date(v[4]).toLocaleDateString('fr-FR') : 'Inconnue',
          telephone: v[5] || 'Non renseigné',
          email: v[6] || 'Non renseigné',
          nom_doctolib: v[7],
          nom_logosw: v[8],
          dossier_logosw: v[9],
          has_warning: v[10] === 1,
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
          "MF": "Dr. Medy Fakreldin",
          "HG": "Dr. Hamza Gafsi",
          "JL": "Dr. Jean Laborde Barbanegre",
          "MFr": "Dr. Benoit Say-Liang-Fat",
          "RMr": "Dr. Benoit Say-Liang-Fat",
          "RMe": "Etudiant non Thèsé",
          "MFe": "Etudiant non Thèsé"
        };
        
        const resolvePraticien = (logoswInitials: string | null, doctolibName: string | null) => {
           if (logoswInitials && logoswInitials !== 'NC') {
               return MAP_PRATICIENS[logoswInitials] || `Dr. ${logoswInitials} (LogosW)`;
           }
           return doctolibName || 'Cabinet Dentaire';
        };

        // Annotations
        const annoRes = db.exec(`SELECT date_rendez_vous, is_dismissed, comment FROM patient_annotations WHERE patient_id = ?`, [id]);
        const annoMap: Record<string, any> = {};
        if (annoRes.length > 0) {
           annoRes[0].values.forEach(v => { annoMap[String(v[0])] = { is_dismissed: v[1], comment: v[2] }; });
        }
        setAnnotations(annoMap);

        // Historique des RDV pour anomalies
        const appsRes = db.exec(`SELECT date, heure, praticien, motif FROM appointments WHERE patient_id = ? AND statut = 'Vu' ORDER BY date DESC`, [id]);
        
        // --- SUGGESTION SYSTEM (bidirectionnel) ---
        const splitW = (t: string) => t.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ\-\s]/g, '').split(/[\s\-]+/).filter(w => w.length > 1);
        const mScore = (wA: string[], wB: string[]) => {
          if (!wA.length || !wB.length) return 0;
          const aInB = wA.filter(wa => wB.some(wb => wb.includes(wa) || wa.includes(wb))).length;
          const bInA = wB.filter(wb => wA.some(wa => wa.includes(wb) || wb.includes(wa))).length;
          return Math.round(Math.max(aInB / wA.length, bInA / wB.length) * 100);
        };

        if (!v[9]) { // If no dossier_logosw
          const dbDate = v[4]; // ISO date 
          if (dbDate) {
            try {
              const logosPs = db.exec(`SELECT dossier_id, nom, prenom FROM logosw_dictionary WHERE date_naissance = ?`, [dbDate]);
              if (logosPs.length > 0 && logosPs[0].values.length > 0) {
                const patientWords = splitW(`${v[2] || ''} ${v[3] || ''}`);
                let bestS: any = null;
                let bestScore = 0;

                logosPs[0].values.forEach((lp: any) => {
                  const lpWords = splitW(`${lp[1] || ''} ${lp[2] || ''}`);
                  const score = mScore(patientWords, lpWords);
                  if (score > bestScore) {
                    bestScore = score;
                    bestS = { id: lp[0], name: `${lp[1]} ${lp[2]}`.trim(), score };
                  }
                });
                if (bestS && bestScore >= 30) setSuggestion(bestS);
              }
            } catch(e) {}
          }
        }
        
        // On croise pour trouver les jours "vides" d'actes
        const actDates = new Set(hRes.length > 0 ? hRes[0].values.map(v => String(v[1])) : []);
        const detectedAnomalies: any[] = [];
        if (appsRes.length > 0) {
           appsRes[0].values.forEach(v => {
              if (!actDates.has(String(v[0]))) {
                 detectedAnomalies.push({
                    date: new Date(String(v[0])),
                    rawDate: String(v[0]),
                    heure: v[1],
                    praticien: v[2],
                    motif: v[3],
                    isAnomaly: true
                 });
              }
           });
        }
        setAnomalies(detectedAnomalies);

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
      } else {
        setNotFound(true);
      }
    } catch (e) { 
        console.error("Erreur fiche patient:", e);
        setNotFound(true);
    }
  }, [id]);

  const saveAnnotation = async () => {
    const db = getDB();
    if (!db || !id || !showAnnotationModal) return;
    db.run("INSERT INTO patient_annotations (patient_id, date_rendez_vous, is_dismissed, comment) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET is_dismissed=excluded.is_dismissed, comment=excluded.comment", 
           [id, showAnnotationModal.rawDate, 1, comment]);
    await saveDB();
    setAnnotations(prev => ({ ...prev, [showAnnotationModal.rawDate]: { is_dismissed: 1, comment } }));
    setShowAnnotationModal(null);
    setComment('');
  };

  const saveManualID = async () => {
    const db = getDB();
    if (!db || !id) return;
    db.run("UPDATE patients SET dossier_logosw = ?, has_warning = 0 WHERE id = ?", [tempID.trim(), id]);
    await saveDB();
    setPatient(prev => ({ ...prev, dossier_logosw: tempID.trim() }));
    setIsEditingID(false);
    // Refresh page data is optional but helps see the immediate effect on history if data was already imported
    window.location.reload(); 
  };

  const confirmSuggestion = async () => {
    const db = getDB();
    if (!db || !id || !suggestion) return;
    db.run("UPDATE patients SET dossier_logosw = ?, has_warning = 0, nom_logosw = ? WHERE id = ?", [suggestion.id, suggestion.name, id]);
    await saveDB();
    window.location.reload();
  };

  if (notFound) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <ShieldAlert size={64} color="var(--danger-text)" />
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Patient introuvable</h2>
          <p style={{ color: 'var(--text-muted)' }}>Ce dossier n'existe pas ou a été supprimé lors d'une réinitialisation.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/patients')}>Retour à la liste</button>
      </div>
    );
  }

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
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  ID LogosW : 
                </span>
                {isEditingID ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input 
                      className="input" 
                      style={{ padding: '2px 8px', fontSize: '0.875rem', width: '100px' }} 
                      value={tempID} 
                      onChange={e => setTempID(e.target.value)}
                      placeholder="Ex: 12345"
                      autoFocus
                    />
                    <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={saveManualID}>Lier</button>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setIsEditingID(false)}>Annuler</button>
                  </div>
                ) : (
                  <span 
                    onClick={() => { setTempID(patient.dossier_logosw || ''); setIsEditingID(true); }}
                    style={{ 
                      fontSize: '0.875rem', 
                      color: patient.dossier_logosw ? 'var(--primary)' : 'var(--warning-text)', 
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderBottom: '1px dashed'
                    }}
                  >
                    {patient.dossier_logosw || 'Non synchronisé (cliquer pour lier)'}
                  </span>
                )}
              </div>
              
              {!patient.dossier_logosw && suggestion && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--primary-light)', borderRadius: '8px', border: '1px dashed var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 size={14} /> Suggestion de couplage ({suggestion.score}%)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{suggestion.name} (LogosW #{suggestion.id})</span>
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={confirmSuggestion}>Confirmer</button>
                  </div>
                </div>
              )}

              {patient.dId !== 'NC' && (
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>ID Doctolib : {patient.dId}</span>
              )}
            </div>
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
              {patient.nom_logosw && patient.nom_logosw !== patient.name && (
                <div style={{ padding: '0.75rem', backgroundColor: '#fff7ed', borderRadius: '0.5rem', marginTop: '0.5rem', border: '1px solid #ffedd5' }}>
                   <div style={{ display: 'flex', gap: '0.5rem', color: '#9a3412', fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem', alignItems: 'center' }}>
                     <ShieldAlert size={14} /> Nom LogosW divergent
                   </div>
                   <span style={{ fontSize: '0.875rem', color: '#9a3412' }}>{patient.nom_logosw}</span>
                </div>
              )}
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
            {acts.length === 0 && anomalies.length === 0 ? (
               <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <FileText size={48} style={{ marginBottom: '1rem' }} />
                 <p>Aucun acte ni rendez-vous historisé pour ce patient.</p>
               </div>
            ) : Object.entries(
               [...acts, ...anomalies].reduce((acc, item) => {
                 const key = item.rawDate || 'NC';
                 if (!acc[key]) acc[key] = [];
                 acc[key].push(item);
                 return acc;
               }, {} as Record<string, any[]>)
            ).sort((a: any, b: any) => b[0].localeCompare(a[0]))
             .map(([_dateStr, dayItems]: [string, any], i) => (
              <div key={i} style={{ padding: '0 0 1.5rem 0', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>
                  <Calendar size={18} />
                  <span style={{ textTransform: 'capitalize' }}>
                    {dayItems[0].date ? dayItems[0].date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date Inconnue'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '1.25rem', borderLeft: '2px solid var(--border)', marginLeft: '0.5rem' }}>
                  {dayItems.map((item: any, j: number) => {
                    if (item.isAnomaly) {
                       const anno = annotations[item.rawDate];
                       return (
                         <div key={j} style={{ display: 'flex', gap: '1rem', padding: '1rem', backgroundColor: anno?.is_dismissed ? '#f8fafc' : '#fff1f2', borderRadius: '0.5rem', border: `1px solid ${anno?.is_dismissed ? 'var(--border)' : '#fecaca'}`, opacity: anno?.is_dismissed ? 0.6 : 1 }}>
                            <div style={{ width: '4px', backgroundColor: '#e11d48', borderRadius: '2px' }}></div>
                            <div style={{ flex: 1 }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                 <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#9f1239', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                   <ShieldAlert size={16} /> Patient venu sans facturation
                                 </h4>
                                 {!anno?.is_dismissed && (
                                   <button className="btn btn-ghost" style={{ padding: '0.25rem', height: 'auto', color: '#9f1239' }} onClick={() => { setShowAnnotationModal(item); setComment(''); }}>
                                     <MessageSquare size={16} />
                                   </button>
                                 )}
                               </div>
                               <p style={{ fontSize: '0.8125rem', color: '#be123c', marginTop: '0.25rem' }}>
                                 RDV le {item.date.toLocaleDateString('fr-FR')} {item.heure ? `à ${item.heure}` : ''} pour "{item.motif}". Aucun acte ou paiement trouvé dans LogosW ce jour.
                               </p>
                               {anno?.comment && (
                                 <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                   Commentaire : {anno.comment}
                                 </div>
                               )}
                            </div>
                         </div>
                       );
                    }
                    return (
                      <div key={j} style={{ display: 'flex', gap: '1rem', padding: '1rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => { setSelectedAct(item); setShowConsultModal(true); }}>
                        <div style={{ width: '4px', backgroundColor: item.type === 'REGLEMENT' ? 'var(--success-bg)' : 'var(--warning-bg)', borderRadius: '2px' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <h4 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.libelle || 'Acte'}</h4>
                            <span style={{ fontWeight: 600, color: item.type === 'REGLEMENT' ? 'var(--success-text)' : 'var(--text)' }}>
                              {(item.type === 'REGLEMENT' ? item.reglement : item.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{item.type === 'REGLEMENT' ? 'Paiement' : 'Prestation'}</span>
                            <span style={{ fontSize: '0.875rem', color: item.type === 'REGLEMENT' ? 'var(--success-text)' : (item.reglement >= item.montant ? 'var(--success-text)' : 'var(--warning-text)'), fontWeight: 500 }}>
                               {item.type === 'REGLEMENT' ? 'Encaissé' : (item.reglement >= item.montant ? 'Réglé' : '')}
                            </span>
                          </div>
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <ShieldAlert size={12} /> Source: {item.source}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
       {showAnnotationModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
             <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <CheckCircle2 color="var(--success-text)" /> Acquitter cette anomalie
             </h2>
             <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
               Expliquez brièvement pourquoi cet acte n'apparaît pas dans LogosW (ex: consultation gratuite, oubli définitif, acte reporté).
             </p>
             <textarea 
               className="input" 
               placeholder="Votre commentaire..." 
               rows={4} 
               value={comment}
               onChange={(e) => setComment(e.target.value)}
             />
             <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowAnnotationModal(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={saveAnnotation}>Enregistrer & Acquitter</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
