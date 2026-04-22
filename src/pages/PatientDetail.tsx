import { useState, useEffect } from 'react';
import { PatientDetailSkeleton } from '../components/Skeleton';
import { ArrowLeft, Download, Calendar, X, ShieldAlert, FileText, CheckCircle2, MessageSquare, Edit3, Plus, Trash2, RotateCcw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDB, saveDB } from '../lib/db';
import { calculateSimilarity } from '../lib/similarity';
import { formatToFrench } from '../lib/dateUtils';
import { AdjustmentModal } from '../components/AdjustmentModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { listAdjustments, softDeleteAdjustment, restoreAdjustment, type ManualAdjustment } from '../lib/adjustments';

type ConfirmState = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  onConfirm: () => void;
};

export function PatientDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
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

  const [comments, setComments] = useState<Array<{ id: number; content: string; created_at: string; updated_at: string }>>([]);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<ManualAdjustment | null>(null);
  const [deletedAdjustments, setDeletedAdjustments] = useState<ManualAdjustment[]>([]);
  const [showDeletedAdjustments, setShowDeletedAdjustments] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const handleExport = () => {
    if (!patient) return;
    const html = `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"/>
      <title>Fiche ${patient.name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 2rem; color: #1a202c; }
        h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
        h2 { font-size: 1rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .meta { color: #718096; font-size: 0.875rem; margin-bottom: 2rem; line-height: 1.8; }
        table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
        th { background: #f7fafc; text-align: left; padding: 0.5rem; font-size: 0.75rem; text-transform: uppercase; border-bottom: 2px solid #edf2f7; }
        td { padding: 0.5rem; border-bottom: 1px solid #edf2f7; font-size: 0.875rem; }
        .summary { display: flex; gap: 2rem; margin-bottom: 0.5rem; }
        .summary span { font-size: 0.875rem; }
        .summary strong { font-size: 1rem; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>
      <h1>Fiche Patient — ${patient.name}</h1>
      <div class="meta">
        Né(e) le : ${patient.dob} &nbsp;|&nbsp; Tél : ${patient.telephone} &nbsp;|&nbsp; Email : ${patient.email}<br/>
        Dossier LogosW : ${patient.dossier_logosw || 'Non lié'} &nbsp;|&nbsp; Dernière consultation : ${patient.lastConsult}
      </div>
      <h2>Résumé financier</h2>
      <div class="summary">
        <span>Total facturé<br/><strong>${patient.total_prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></span>
        <span>Total encaissé<br/><strong>${patient.total_enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></span>
        <span>Reste dû<br/><strong>${patient.pending.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong></span>
      </div>
      <h2>Historique des actes</h2>
      <table>
        <thead><tr><th>Date</th><th>Acte</th><th>Cotation</th><th>Dents</th><th>Montant</th><th>Réglé</th><th>Source</th></tr></thead>
        <tbody>
          ${acts.map((a: any) => `<tr>
            <td>${a.date || '-'}</td>
            <td>${a.libelle || '-'}</td>
            <td>${a.type === 'ACTE' ? (a.cotation || 'Non renseigné') : '-'}</td>
            <td>${a.type === 'ACTE' ? (a.dents || 'Non renseigné') : '-'}</td>
            <td>${Number(a.montant_acte || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
            <td>${Number(a.reglement_somme || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
            <td>${a.source || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <script>window.onload = () => window.print();</script>
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

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
        
        // Stats — inclut actes importés + ajustements manuels via la VIEW.
        const actRes = db.exec(`
          SELECT SUM(montant_acte), SUM(reglement_somme)
          FROM financial_entries
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
          dob: v[4] ? formatToFrench(String(v[4])) : 'Inconnue',
          telephone: v[5] || 'Non renseigné',
          email: v[6] || 'Non renseigné',
          nom_doctolib: v[7],
          nom_logosw: v[8],
          dossier_logosw: v[9],
          has_warning: v[10] === 1,
          lastConsult: aRes[0]?.values[0]?.[0] ? formatToFrench(String(aRes[0].values[0][0])) : 'Aucune',
          praticien: aRes[0]?.values[0]?.[1] || 'Non assigné',
          total_prod: prod,
          total_enc: enc,
          pending: prod - enc
        });

        // Historique des actes (inclut les ajustements manuels actifs via la VIEW financial_entries)
        const hRes = db.exec(`
          SELECT f.id, f.date, f.libelle, f.montant_acte, f.reglement_somme, f.source, f.type,
                 f.logosw_praticien,
                 (SELECT praticien FROM appointments WHERE patient_id = f.patient_id AND date = f.date LIMIT 1) as praticien_appt,
                 f.is_manual, f.comment, f.updated_at, f.cotation, f.dents
          FROM financial_entries f
          WHERE f.patient_id = ?
          ORDER BY f.date DESC
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

        // Commentaires libres (note de suivi / remarques comptables)
        const cRes = db.exec(
          `SELECT id, content, created_at, updated_at FROM patient_comments WHERE patient_id = ? ORDER BY created_at DESC`,
          [id]
        );
        if (cRes.length > 0) {
          setComments(cRes[0].values.map((row: any) => ({
            id: Number(row[0]),
            content: String(row[1]),
            created_at: String(row[2]),
            updated_at: String(row[3]),
          })));
        } else {
          setComments([]);
        }

        // Historique des RDV pour anomalies
        const appsRes = db.exec(`SELECT date, heure, praticien, motif FROM appointments WHERE patient_id = ? AND statut = 'Vu' ORDER BY date DESC`, [id]);
        
         // --- SUGGESTION SYSTEM (Smart Match) ---
         if (!v[9]) { // Si pas d'ID LogosW
            const dbDate = v[4] ? String(v[4]) : null;
            if (dbDate) {
               try {
                  const stmt = db.prepare("SELECT dossier_id, nom, prenom FROM logosw_dictionary WHERE date_naissance = ?");
                  stmt.bind([dbDate]);
                  const logosPs: any[] = [];
                  while(stmt.step()) {
                    const row = stmt.get();
                    logosPs.push({ id: row[0], nom: row[1], prenom: row[2] });
                  }
                  stmt.free();

                  if (logosPs.length > 0) {
                     if (logosPs.length === 1) {
                        const lp = logosPs[0];
                        const score = calculateSimilarity(`${v[2]} ${v[3]}`, `${lp.nom} ${lp.prenom}`);
                        setSuggestion({ type: 'match', id: lp.id, name: `${lp.nom} ${lp.prenom}`.trim(), score, unique: true });
                     } else {
                        const targetName = `${v[2]} ${v[3]}`;
                        let best: any = null;
                        let bestScore = 0;
                        logosPs.forEach(lp => {
                           const candName = `${lp.nom} ${lp.prenom}`;
                           const score = calculateSimilarity(targetName, candName);
                           if (score > bestScore) {
                              bestScore = score;
                              best = lp;
                           }
                        });
                        if (best && bestScore >= 50) {
                           setSuggestion({ type: 'match', id: best.id, name: `${best.nom} ${best.prenom}`.trim(), score: bestScore, unique: false });
                        } else {
                           setSuggestion({ type: 'multiple', count: logosPs.length });
                        }
                     }
                  } else {
                     // TENTATIVE DE SMART SWAP (Inversion Jour/Mois pour format US/FR)
                     let foundBySwap = false;
                     const parts = dbDate.split('-');
                     if (parts.length === 3) {
                       const y = parts[0], m = parseInt(parts[1]), d = parseInt(parts[2]);
                       if (m <= 12 && d <= 12 && m !== d) {
                          const swapped = `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
                          const stmt2 = db.prepare("SELECT dossier_id, nom, prenom FROM logosw_dictionary WHERE date_naissance = ?");
                          stmt2.bind([swapped]);
                          const logosPs2: any[] = [];
                          while(stmt2.step()) {
                             const r = stmt2.get();
                             logosPs2.push({ id: r[0], nom: r[1], prenom: r[2] });
                          }
                          stmt2.free();
                          
                          if (logosPs2.length > 0) {
                             const lp = logosPs2[0];
                             const score = calculateSimilarity(`${v[2]} ${v[3]}`, `${lp.nom} ${lp.prenom}`);
                             setSuggestion({ 
                                type: 'match', 
                                id: lp.id, 
                                name: `${lp.nom} ${lp.prenom}`.trim(), 
                                score, 
                                unique: logosPs2.length === 1,
                                isSwapped: true,
                                originalDob: dbDate,
                                swappedDob: swapped
                             });
                             foundBySwap = true;
                          }
                       }
                     }

                     if (!foundBySwap) {
                        setSuggestion({ type: 'no_dob_match', dob: formatToFrench(dbDate) });

                        // TENTATIVE DE FALLBACK PAR NOM (Si la date échoue totalement)
                        const firstName = String(v[3] || '').split(' ')[0] || "";
                        const lastName = String(v[2] || '').split(' ')[0] || "";
                        
                        if (firstName.length > 2 || lastName.length > 2) {
                           const stmt3 = db.prepare("SELECT dossier_id, nom, prenom, date_naissance FROM logosw_dictionary WHERE nom LIKE ? OR prenom LIKE ? OR nom LIKE ?");
                           stmt3.bind([`%${lastName}%`, `%${firstName}%`, `%${firstName}%`]);
                           
                           let bestFallback: any = null;
                           let bestFallbackScore = 0;
                           
                           while(stmt3.step()) {
                              const r = stmt3.get();
                              const candName = `${r[1]} ${r[2]}`;
                              const score = calculateSimilarity(`${v[2]} ${v[3]}`, candName);
                              if (score > bestFallbackScore) {
                                 bestFallbackScore = score;
                                 bestFallback = { id: r[0], name: candName.trim(), dob: r[3] };
                              }
                           }
                           stmt3.free();
                           
                           if (bestFallback && bestFallbackScore >= 85) {
                              setSuggestion({ 
                                 type: 'match', 
                                 id: bestFallback.id, 
                                 name: bestFallback.name, 
                                 score: bestFallbackScore, 
                                 unique: false,
                                 diffDob: true,
                                 logosDob: bestFallback.dob,
                                 doctolibDob: dbDate
                              });
                           }
                        }
                     }
                  }
               } catch (err) {
                  console.error("Suggestion error:", err);
               }
            } else {
               setSuggestion({ type: 'no_dob' });
            }
         } else {
            setSuggestion(null);
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
              logosw_praticien: act[7],
              isManual: Number(act[9]) === 1,
              comment: act[10] ? String(act[10]) : null,
              updatedAt: act[11] ? String(act[11]) : null,
              cotation: act[12] ? String(act[12]) : null,
              dents: act[13] ? String(act[13]) : null,
            })).filter((act: any) => !(act.montant === 0 && act.reglement === 0)));
         }

         // Ajustements manuels supprimés (corbeille) — permet la restauration
         const allAdj = listAdjustments(Number(id), true);
         setDeletedAdjustments(allAdj.filter(a => a.deleted_at !== null));
      } else {
        setNotFound(true);
      }
    } catch (e) {
        console.error("Erreur fiche patient:", e);
        setNotFound(true);
    } finally {
        setLoading(false);
    }
  }, [id, refreshKey]);

  const handleDeleteAdjustment = (adjId: number) => {
    setConfirmState({
      title: 'Supprimer l’ajustement',
      message: 'Supprimer cet ajustement manuel ? Il sera déplacé dans la corbeille.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        await softDeleteAdjustment(adjId);
        setRefreshKey(k => k + 1);
      },
    });
  };

  const handleRestoreAdjustment = async (adjId: number) => {
    const ok = await restoreAdjustment(adjId);
    if (!ok) {
      setConfirmState({
        title: 'Restauration impossible',
        message: 'Le patient associé est introuvable, la restauration a été annulée.',
        confirmLabel: 'OK',
        cancelLabel: null,
        onConfirm: () => {},
      });
      return;
    }
    setRefreshKey(k => k + 1);
  };

  const addComment = async () => {
    const db = getDB();
    const content = newComment.trim();
    if (!db || !id || !content) return;
    db.run("INSERT INTO patient_comments (patient_id, content) VALUES (?, ?)", [id, content]);
    await saveDB();
    const res = db.exec(
      `SELECT id, content, created_at, updated_at FROM patient_comments WHERE patient_id = ? ORDER BY created_at DESC`,
      [id]
    );
    if (res.length > 0) {
      setComments(res[0].values.map((row: any) => ({
        id: Number(row[0]),
        content: String(row[1]),
        created_at: String(row[2]),
        updated_at: String(row[3]),
      })));
    }
    setNewComment('');
  };

  const updateComment = async (commentId: number) => {
    const db = getDB();
    const content = editingContent.trim();
    if (!db || !id || !content) return;
    db.run(
      "UPDATE patient_comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND patient_id = ?",
      [content, commentId, id]
    );
    await saveDB();
    const res = db.exec(
      `SELECT id, content, created_at, updated_at FROM patient_comments WHERE patient_id = ? ORDER BY created_at DESC`,
      [id]
    );
    if (res.length > 0) {
      setComments(res[0].values.map((row: any) => ({
        id: Number(row[0]),
        content: String(row[1]),
        created_at: String(row[2]),
        updated_at: String(row[3]),
      })));
    }
    setEditingCommentId(null);
    setEditingContent('');
  };

  const deleteComment = (commentId: number) => {
    setConfirmState({
      title: 'Supprimer le commentaire',
      message: 'Supprimer ce commentaire ? Cette action est définitive.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        const db = getDB();
        if (!db || !id) return;
        db.run("DELETE FROM patient_comments WHERE id = ? AND patient_id = ?", [commentId, id]);
        await saveDB();
        setComments(prev => prev.filter(c => c.id !== commentId));
        if (editingCommentId === commentId) {
          setEditingCommentId(null);
          setEditingContent('');
        }
      },
    });
  };

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
    setPatient((prev: any) => ({ ...prev, dossier_logosw: tempID.trim() }));
    setIsEditingID(false);
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

  if (loading) return <PatientDetailSkeleton />;

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
                suggestion.type === 'match' ? (
                  <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#065f46', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <CheckCircle2 size={14} /> 
                      {suggestion.isSwapped ? 'Correspondance trouvée (Inversion Jour/Mois)' : (suggestion.unique ? 'Seul patient né à cette date' : `Match ${suggestion.score}%`)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Potentiellement <strong>{suggestion.name}</strong> (Dossier #{suggestion.id})</span>
                        {suggestion.isSwapped && (
                          <span style={{ fontSize: '0.75rem', color: '#065f46', opacity: 0.8 }}>
                            LogosW: {formatToFrench(suggestion.swappedDob)} vs Doctolib: {formatToFrench(suggestion.originalDob)}
                          </span>
                        )}
                        {suggestion.diffDob && (
                          <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.25rem', fontWeight: 600 }}>
                            ⚠️ Date de naissance LogosW différente : {formatToFrench(suggestion.logosDob)}
                          </div>
                        )}
                      </div>
                      <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={confirmSuggestion}>Confirmer le lien</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '0.75rem', color: '#92400e' }}>
                    <ShieldAlert size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    {suggestion.type === 'no_dict' && 'Dictionnaire LogosW vide — veuillez importer votre fichier "Mise à jour Base Patients" pour activer les suggestions automatiques.'}
                    {suggestion.type === 'no_dob' && 'Pas de date de naissance en base pour ce patient — impossible de chercher dans LogosW.'}
                    {suggestion.type === 'no_dob_match' && `Aucun patient LogosW trouvé avec la date de naissance ${suggestion.dob}.`}
                    {suggestion.type === 'no_name_match' && `${suggestion.count} patient(s) LogosW né(s) à la même date mais aucun nom ne correspond.`}
                    {suggestion.type === 'error' && 'Erreur lors de la recherche — consultez la console (F12).'}
                  </div>
                )
              )}

              {patient.dId !== 'NC' && (
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>ID Doctolib : {patient.dId}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={handleExport}><Download size={18} /> Exporter la fiche</button>
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

          <div className="card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={18} /> Commentaires
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <textarea
                className="input"
                placeholder="Ajouter un commentaire…"
                rows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button
                className="btn btn-primary"
                disabled={!newComment.trim()}
                onClick={addComment}
                style={{ alignSelf: 'flex-end' }}
              >
                Ajouter
              </button>
            </div>

            {comments.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem 0' }}>
                Aucun commentaire.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '320px', overflowY: 'auto' }}>
                {comments.map((c) => (
                  <div key={c.id} style={{ padding: '0.75rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    {editingCommentId === c.id ? (
                      <>
                        <textarea
                          className="input"
                          rows={3}
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                          <button className="btn btn-ghost" onClick={() => { setEditingCommentId(null); setEditingContent(''); }}>Annuler</button>
                          <button
                            className="btn btn-primary"
                            disabled={!editingContent.trim()}
                            onClick={() => updateComment(c.id)}
                          >
                            Enregistrer
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', margin: 0 }}>{c.content}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(c.created_at + 'Z').toLocaleString('fr-FR')}
                            {c.updated_at !== c.created_at && ' · modifié'}
                          </span>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => { setEditingCommentId(c.id); setEditingContent(c.content); }}
                            >
                              Modifier
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger-text)' }}
                              onClick={() => deleteComment(c.id)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Colonne Historique */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: 0 }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Historique des actes & règlements</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {deletedAdjustments.length > 0 && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                  onClick={() => setShowDeletedAdjustments(v => !v)}
                >
                  {showDeletedAdjustments ? 'Masquer' : 'Afficher'} corbeille ({deletedAdjustments.length})
                </button>
              )}
              <button
                className="btn btn-primary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => { setEditingAdjustment(null); setShowAdjustmentModal(true); }}
              >
                <Plus size={14} />
                Ajouter un ajustement
              </button>
            </div>
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
                    {dayItems[0].date ? formatToFrench(dayItems[0].date) : (dayItems[0].rawDate || 'Date Inconnue')}
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
                                 RDV le {item.date ? formatToFrench(item.date) : ''} {item.heure ? `à ${item.heure}` : ''} pour "{item.motif}". Aucun acte ou paiement trouvé dans LogosW ce jour.
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
                    const isManual = !!item.isManual;
                    const accentColor = isManual
                      ? '#7c3aed'
                      : (item.type === 'REGLEMENT' ? 'var(--success-bg)' : 'var(--warning-bg)');
                    return (
                      <div
                        key={j}
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          padding: '1rem',
                          backgroundColor: isManual ? '#f5f3ff' : 'var(--bg)',
                          borderRadius: '0.5rem',
                          cursor: isManual ? 'default' : 'pointer',
                          border: isManual ? '1px solid #ddd6fe' : '1px solid var(--border)',
                        }}
                        onClick={isManual ? undefined : () => { setSelectedAct(item); setShowConsultModal(true); }}
                      >
                        <div style={{ width: '4px', backgroundColor: accentColor, borderRadius: '2px' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', gap: '0.5rem' }}>
                            <h4 style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {item.libelle || 'Acte'}
                              {isManual && (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '0.1rem 0.5rem',
                                    borderRadius: '9999px',
                                    backgroundColor: '#ede9fe',
                                    color: '#6d28d9',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                  }}
                                >
                                  <Edit3 size={10} />
                                  Ajusté manuellement
                                </span>
                              )}
                            </h4>
                            <span style={{ fontWeight: 600, color: item.type === 'REGLEMENT' ? 'var(--success-text)' : 'var(--text)' }}>
                              {(item.type === 'REGLEMENT' ? item.reglement : item.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{item.type === 'REGLEMENT' ? 'Paiement' : 'Prestation'}</span>
                              {!isManual && item.type === 'ACTE' && (
                                <span
                                  className="badge"
                                  title="Cotation LogosW"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '0.1rem 0.5rem',
                                    borderRadius: '9999px',
                                    backgroundColor: item.cotation ? 'var(--info-bg)' : 'var(--bg)',
                                    color: item.cotation ? 'var(--info-text)' : 'var(--text-muted)',
                                    fontWeight: 500,
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  Cotation : {item.cotation || 'Non renseigné'}
                                </span>
                              )}
                              {!isManual && item.type === 'ACTE' && (
                                <span
                                  className="badge"
                                  title="Dent(s) concernée(s)"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '0.1rem 0.5rem',
                                    borderRadius: '9999px',
                                    backgroundColor: item.dents ? 'var(--info-bg)' : 'var(--bg)',
                                    color: item.dents ? 'var(--info-text)' : 'var(--text-muted)',
                                    fontWeight: 500,
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  Dents : {item.dents || 'Non renseigné'}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.875rem', color: item.type === 'REGLEMENT' ? 'var(--success-text)' : (item.reglement >= item.montant ? 'var(--success-text)' : 'var(--warning-text)'), fontWeight: 500 }}>
                               {item.type === 'REGLEMENT' ? 'Encaissé' : (item.reglement >= item.montant ? 'Réglé' : '')}
                            </span>
                          </div>
                          {isManual && item.comment && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: '4px', fontSize: '0.75rem', fontStyle: 'italic', color: '#5b21b6' }}>
                              « {item.comment} »
                            </div>
                          )}
                          <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '0.75rem', color: isManual ? '#6d28d9' : 'var(--info-text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              {isManual ? <Edit3 size={12} /> : <ShieldAlert size={12} />}
                              Source : {isManual ? 'Saisie manuelle' : item.source}
                              {isManual && item.updatedAt && (
                                <span style={{ marginLeft: '0.5rem', opacity: 0.75 }}>
                                  · {new Date(String(item.updatedAt) + 'Z').toLocaleString('fr-FR')}
                                </span>
                              )}
                            </div>
                            {isManual && (
                              <div style={{ display: 'flex', gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', color: '#6d28d9' }}
                                  onClick={() => {
                                    const existing = listAdjustments(Number(id)).find(a => a.id === item.id);
                                    if (existing) { setEditingAdjustment(existing); setShowAdjustmentModal(true); }
                                  }}
                                >
                                  Modifier
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger-text)' }}
                                  onClick={() => handleDeleteAdjustment(Number(item.id))}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {showDeletedAdjustments && deletedAdjustments.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderTop: '1px dashed var(--border)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Trash2 size={14} /> Corbeille — ajustements supprimés
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {deletedAdjustments.map(adj => (
                    <div key={adj.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem', border: '1px dashed var(--border)', opacity: 0.75 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 500, textDecoration: 'line-through' }}>{adj.libelle}</span>
                          <span style={{ fontWeight: 600, textDecoration: 'line-through' }}>
                            {(adj.type === 'REGLEMENT' ? adj.reglement_somme : adj.montant_acte).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {formatToFrench(adj.date)} · supprimé le {adj.deleted_at ? new Date(adj.deleted_at + 'Z').toLocaleString('fr-FR') : '—'}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)' }}
                        onClick={() => handleRestoreAdjustment(adj.id)}
                      >
                        <RotateCcw size={12} /> Restaurer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdjustmentModal && patient && (
        <AdjustmentModal
          patientId={Number(id)}
          patientName={patient.name}
          existing={editingAdjustment}
          onClose={() => { setShowAdjustmentModal(false); setEditingAdjustment(null); }}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          danger={confirmState.danger}
          onConfirm={confirmState.onConfirm}
          onClose={() => setConfirmState(null)}
        />
      )}

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
                <div style={{ fontWeight: 500 }}>{selectedAct.date ? formatToFrench(selectedAct.date) : formatToFrench(selectedAct.rawDate)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Relevé</span>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>{selectedAct.libelle}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type: {selectedAct.type}</div>
                  {selectedAct.type === 'ACTE' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      Cotation : {selectedAct.cotation || 'Non renseigné'}
                    </div>
                  )}
                  {selectedAct.type === 'ACTE' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      Dents : {selectedAct.dents || 'Non renseigné'}
                    </div>
                  )}
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
