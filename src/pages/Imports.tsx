import { useState, useRef, useEffect } from 'react';
import { Loader2, ShieldAlert, Eye, History as HistoryIcon, FileText, CheckCircle, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getDB, saveDB } from '../lib/db';

export function Imports() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [status, setStatus] = useState<{ [key: string]: 'success' | 'error' | null }>({});
  const [previews, setPreviews] = useState<{ doctolib: any[], logosw: any[] }>({ doctolib: [], logosw: [] });
  const [rawData, setRawData] = useState<{ doctolib: any[], logosw: any[] }>({ doctolib: [], logosw: [] });
  const [stats, setStats] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedAnomalies, setSelectedAnomalies] = useState<any[] | null>(null);

  const doctolibFileRef = useRef<HTMLInputElement>(null);
  const logoswFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = () => {
    const db = getDB();
    if (!db) return;
    try {
      const res = db.exec("SELECT id, timestamp, source, record_count, total_prod, total_enc, import_id, anomalies_json FROM import_logs ORDER BY timestamp DESC LIMIT 20");
      if (res.length > 0) {
        setHistory(res[0].values.map(v => ({ id: v[0], timestamp: v[1], source: v[2], count: v[3], prod: v[4], enc: v[5], import_id: v[6], anomalies: v[7] ? JSON.parse(String(v[7])) : [] })));
      } else {
        setHistory([]);
      }
    } catch (e) { console.error("History load error", e); }
  };

  const formatDate = (dateInput: any) => {
    if (!dateInput) return "";
    if (dateInput instanceof Date) return dateInput.toISOString().split('T')[0];
    let str = String(dateInput).trim();
    if (/^\d{1,2}[:h]\d{2}$/.test(str)) return "";
    if (!isNaN(Number(str)) && str.length >= 5) {
      const date = new Date((Number(str) - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    const parts = str.split(/[\/\-\.]/);
    if (parts.length === 3) {
      let year = parts[2].split(' ')[0];
      if (year.length === 2) year = `20${year}`;
      const month = parts[1].padStart(2, '0');
      const day = parts[0].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return "";
  };

  const normalizeName = (str: string) => {
    if (!str) return "";
    return String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 0).sort().join(" ");
  };

  const getMappedValue = (row: any, userKey: string) => {
    if (row[userKey] !== undefined) return row[userKey];
    const keys = Object.keys(row);
    const foundKey = keys.find(k => k.toLowerCase().trim() === userKey.toLowerCase().trim());
    return foundKey ? row[foundKey] : null;
  };

  const parseFile = (file: File, type: 'doctolib' | 'logosw') => {
    setLoading(prev => ({ ...prev, [type]: true }));
    setErrorMsg(null);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const bstr = e.target?.result;
      if (!bstr) return;

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = bstr as string;
        Papa.parse(text, {
          header: true, skipEmptyLines: true, delimiter: "",
          complete: (results) => {
            setRawData(prev => ({ ...prev, [type]: results.data }));
            processPreview(results.data, type);
          }
        });
      } else {
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);
        setRawData(prev => ({ ...prev, [type]: data }));
        processPreview(data, type);
      }
    };

    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, "UTF-8");
    else reader.readAsBinaryString(file);
  };

  const processPreview = (data: any[], type: 'doctolib' | 'logosw') => {
    if (data.length === 0) {
      setPreviews(prev => ({ ...prev, [type]: [] }));
      setLoading(prev => ({ ...prev, [type]: false }));
      return;
    }

    // On scanne les 100 premières lignes pour être sûr de capter toutes les entêtes
    // (Dans Excel, si la 1ère ligne a une cellule vide, la clef disparait dans json)
    const keySet = new Set<string>();
    data.slice(0, 100).forEach(row => {
       Object.keys(row).forEach(k => keySet.add(k.toLowerCase().trim()));
    });
    const keys = Array.from(keySet);

    const hasKey = (searchKeys: string[]) => searchKeys.some(sk => keys.includes(sk) || keys.some(k => k.includes(sk)));

    let hasReglementKey = hasKey(['règlements', 'réglements', 'reglements', 'règlement', 'réglement', 'reglement', 'paiement', 'crédit']);
    const hasActeKey = hasKey(['acte', 'libellé', 'libelle']);
    
    // Si la clef n'est pas trouvée (souvent dû au décalage Excel LogosW), on vérifie si l'algorithme de sauvetage trouverait l'argent.
    if (!hasReglementKey && hasActeKey) {
       for (const row of data.slice(0, 100)) {
           const rawActe = String(row["Acte"] || row["Libellé"] || row["acte"] || "").toLowerCase();
           if (rawActe.includes("reglement") || rawActe.includes("règlement") || rawActe.includes("réglement") || rawActe.includes(" virement") || rawActe.includes(" cb ")) {
               for (const [key, value] of Object.entries(row)) {
                   const lowerK = key.toLowerCase();
                   if (lowerK.includes("date") || lowerK.includes("patient") || lowerK.includes("acte") || lowerK.includes("cotation") || lowerK.includes("dt") || lowerK.includes("dont nr")) continue;
                   const parsed = parseFloat(String(value || "0").replace(/[^0-9.,-]/g, "").replace(",", "."));
                   if (!isNaN(parsed) && parsed > 0) {
                       hasReglementKey = true;
                       break;
                   }
               }
           }
           if (hasReglementKey) break;
       }
    }

    let validations = [];
    if (type === 'doctolib') {
      validations = [
        { label: 'Date du RDV', found: hasKey(['doctolib patient id_1', 'date de début', 'début']) },
        { label: 'Identifiant Patient', found: hasKey(['doctolib patient id']) },
        { label: 'Nom du patient', found: hasKey(['nom du patient']) },
        { label: 'Prénom du patient', found: hasKey(['prénom du patient']) },
      ];
    } else {
      validations = [
        { label: 'Date', found: hasKey(['date']) },
        { label: 'Identité Patient', found: hasKey(['patient']) },
        { label: 'Initiale Praticien', found: hasKey(['praticien']) },
        { label: 'Nature de l\'acte', found: hasActeKey },
        { label: 'Colonne Production', found: hasKey(['montant', 'honoraires', 'débit', '€']) },
        { label: 'Calcul Encaissement', found: hasReglementKey },
      ];
    }

    setPreviews(prev => ({ ...prev, [type]: validations }));
    setLoading(prev => ({ ...prev, [type]: false }));
    setStatus(prev => ({ ...prev, [type]: 'success' }));
  };

  const injectToDatabase = async () => {
     const db = getDB();
     if (!db) { setErrorMsg("Base de données introuvable !"); return; }
     
     setErrorMsg(null);
     setLoading(prev => ({ ...prev, global: true }));
     
     const importId = 'IMP-' + Date.now().toString() + Math.floor(Math.random()*1000).toString();

     db.run("BEGIN TRANSACTION");
     try {
       // --- ÉTAPE DE NETTOYAGE (Option A) ---
       // On identifie toutes les dates présentes dans les fichiers pour les nettoyer avant injection
       const datesToClean = new Set<string>();
       rawData.doctolib.forEach(row => {
         const d = formatDate(getMappedValue(row, "Doctolib Patient ID_1") || getMappedValue(row, "Date de début"));
         if (d) datesToClean.add(d);
       });
       rawData.logosw.forEach(row => {
         const d = formatDate(getMappedValue(row, "Date"));
         if (d) datesToClean.add(d);
       });

       for (const date of datesToClean) {
         db.run("DELETE FROM appointments WHERE date = ?", [date]);
         db.run("DELETE FROM clinical_acts WHERE date = ?", [date]);
       }

       // 1. DOCTOLIB
       setProgress("Génération des fiches patients...");
       for (const row of rawData.doctolib) {
         const pIdExRaw = getMappedValue(row, "Doctolib Patient ID");
         if (!pIdExRaw) continue;
         const pIdEx = String(pIdExRaw);

         const nom = getMappedValue(row, "Nom du patient") || "";
         const prenom = getMappedValue(row, "Prénom du patient") || "";
         const norm = normalizeName(`${nom} ${prenom}`);

         db.run(`INSERT INTO patients (doctolib_id, civilite, nom, prenom, nom_complet_norm, nom_naissance, date_naissance, email, telephone, adresse, code_postal, ville)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(doctolib_id) DO UPDATE SET
                 nom=excluded.nom, prenom=excluded.prenom, telephone=excluded.telephone, email=excluded.email, adresse=excluded.adresse`,
                [pIdEx, getMappedValue(row, "Civilité"), nom, prenom, norm, getMappedValue(row, "Nom de naissance"), formatDate(getMappedValue(row, "Date de naissance")), getMappedValue(row, "Email du patient"), getMappedValue(row, "Téléphone portable"), getMappedValue(row, "Adresse"), getMappedValue(row, "Code postal"), getMappedValue(row, "Ville")]);

         const pIdRes = db.exec(`SELECT id FROM patients WHERE doctolib_id = ?`, [pIdEx]);
         const pIdInternal = pIdRes[0]?.values[0][0];

         const visitDate = formatDate(getMappedValue(row, "Doctolib Patient ID_1") || getMappedValue(row, "Date de début"));
         db.run(`INSERT INTO appointments (appointment_uid, patient_id, date, heure, praticien, motif, statut, import_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [getMappedValue(row, "Id") || Math.random().toString(), pIdInternal, visitDate, getMappedValue(row, "Début") || "", getMappedValue(row, "Agenda") || "", getMappedValue(row, "Motif du RDV") || "", getMappedValue(row, "Statut") || "", importId]);
       }

       // 2. LOGOSW
       setProgress("Analyse des flux financiers LogosW...");
       const LOGOSW_BLACKLIST = ['total', 'honoraires', 'reglement', 'réglement', 'règlement', 'logosw', 'grand total'];
       for (const row of rawData.logosw) {
         const label = String(getMappedValue(row, "Patient") || "").trim();
         if (!label || LOGOSW_BLACKLIST.some(kw => label.toLowerCase().includes(kw))) continue;

         const norm = normalizeName(label);
         const visitDate = formatDate(getMappedValue(row, "Date"));
         
         let pIdRes = db.exec(`SELECT id FROM patients WHERE nom_complet_norm = ?`, [norm]);
         let pId = pIdRes[0]?.values[0][0];
         if (!pId) {
            db.run(`INSERT INTO patients (nom, nom_complet_norm) VALUES (?, ?)`, [label, norm]);
            pId = db.exec(`SELECT id FROM patients WHERE nom_complet_norm = ?`, [norm])[0]?.values[0][0];
         }

         const rawActe = String(getMappedValue(row, "Acte") || getMappedValue(row, "Libellé") || "");
         
         let montantActe = parseFloat(String(getMappedValue(row, "Montant") || getMappedValue(row, "Honoraires") || getMappedValue(row, "Débit") || getMappedValue(row, "€") || "0").replace(/[^0-9.,-]/g, "").replace(",", "."));
         let reglementSomme = parseFloat(String(getMappedValue(row, "Réglements") || getMappedValue(row, "Règlements") || getMappedValue(row, "Reglements") || getMappedValue(row, "Réglement") || getMappedValue(row, "Règlement") || getMappedValue(row, "Reglement") || getMappedValue(row, "Paiement") || getMappedValue(row, "Crédit") || "0").replace(/[^0-9.,-]/g, "").replace(",", "."));
         
         if (isNaN(montantActe)) montantActe = 0;
         if (isNaN(reglementSomme)) reglementSomme = 0;

         const isReglementStr = rawActe.toLowerCase().includes("reglement") || 
                                rawActe.toLowerCase().includes("règlement") || 
                                rawActe.toLowerCase().includes("réglement") || 
                                rawActe.toLowerCase().includes("chèque") || 
                                rawActe.toLowerCase().includes("cheque") || 
                                rawActe.toLowerCase().includes("carte bancaire") || 
                                rawActe.toLowerCase().includes(" virement") || 
                                rawActe.toLowerCase().includes("espèce") || 
                                rawActe.toLowerCase().includes(" cb ");

         // Si le libellé indique un paiement mais que la somme est tombée dans "montantActe" (colonne unique)
         if (isReglementStr && reglementSomme === 0 && Math.abs(montantActe) > 0) {
             reglementSomme = Math.abs(montantActe);
             montantActe = 0;
         }
         
         // SAUVETAGE EXTRÊME : Si c'est un paiement, mais que les colonnes financières sont vides (Décalage Excel LogosW)
         if (isReglementStr && reglementSomme === 0 && montantActe === 0) {
             for (const key of Object.keys(row)) {
                 const lowerKey = key.toLowerCase();
                 // On ignore les colonnes dont on est sûr qu'elles sont du texte ou non-financières
                 if (lowerKey.includes("date") || lowerKey.includes("patient") || lowerKey.includes("acte") || lowerKey.includes("libell") || lowerKey.includes("cotation") || lowerKey.includes("dt") || lowerKey.includes("dont nr")) {
                     continue;
                 }
                 const rawVal = String(row[key] || "0");
                 const parsed = parseFloat(rawVal.replace(/[^0-9.,-]/g, "").replace(",", "."));
                 if (!isNaN(parsed) && parsed > 0) {
                     reglementSomme = parsed;
                     break; // On a trouvé l'argent caché dans une colonne fantôme !
                 }
             }
         }
         
         const typeAct = (isReglementStr || reglementSomme > 0) ? 'REGLEMENT' : 'ACTE';
         const logoswPraticien = String(getMappedValue(row, "Praticien") || "").trim() || "NC";

         db.run(`INSERT INTO clinical_acts (patient_id, date, libelle, montant_acte, reglement_somme, type, source, logosw_praticien, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [pId, visitDate, rawActe, montantActe, reglementSomme, typeAct, "LogosW", logoswPraticien, importId]);
       }

       db.run("COMMIT");
       await saveDB();

       let minDateStr = '9999-99-99';
       let maxDateStr = '0000-00-00';
       for (const date of datesToClean) {
         if (date < minDateStr) minDateStr = date;
         if (date > maxDateStr) maxDateStr = date;
       }
       const periodStr = minDateStr <= maxDateStr 
         ? `Du ${new Date(minDateStr).toLocaleDateString('fr-FR')} au ${new Date(maxDateStr).toLocaleDateString('fr-FR')}` 
         : '';

       const newStats = calculateStatsSync(db, minDateStr <= maxDateStr ? minDateStr : undefined, maxDateStr >= minDateStr ? maxDateStr : undefined);
       newStats.periodStr = periodStr;
       setStats(newStats);
       
       // Save to log with period appended to source
       const anomaliesJson = JSON.stringify(newStats.missingList || []);
       db.run("INSERT INTO import_logs (source, record_count, total_prod, total_enc, import_id, anomalies_json) VALUES (?, ?, ?, ?, ?, ?)", 
              [`Doctolib + LogosW (${periodStr})`, rawData.doctolib.length + rawData.logosw.length, newStats.production, newStats.encaissement, importId, anomaliesJson]);
       await saveDB();
       
       loadHistory();

     } catch (e: any) {
       db.run("ROLLBACK");
       setErrorMsg("Échec de l'injection : " + (e.message || "Erreur inconnue"));
     }
     setLoading(prev => ({ ...prev, global: false }));
     setProgress(null);
  };

  const calculateStatsSync = (db: any, minDate?: string, maxDate?: string) => {
    let dateFilterAppt = "";
    let dateFilterActs = "";
    let argsAppt: string[] = [];
    let argsActs: string[] = [];

    if (minDate && maxDate) {
        dateFilterAppt = " AND date >= ? AND date <= ? ";
        argsAppt = [minDate, maxDate];
        dateFilterActs = " AND ca.date >= ? AND ca.date <= ? ";
        argsActs = [minDate, maxDate];
    }

    const res = db.exec(`
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE statut = 'Vu' ${dateFilterAppt}) as vus,
        (SELECT SUM(montant_acte) FROM clinical_acts ca WHERE type = 'ACTE' ${dateFilterActs}) as prod,
        (SELECT SUM(reglement_somme) FROM clinical_acts ca WHERE 1=1 ${dateFilterActs}) as enc,
        (SELECT COUNT(DISTINCT a.id) FROM appointments a JOIN clinical_acts ca ON a.patient_id = ca.patient_id AND a.date = ca.date WHERE a.statut = 'Vu' ${dateFilterActs.replace(/ca\./g, 'a.')}) as matched
    `, [...argsAppt, ...argsActs, ...argsActs, ...argsActs]); // Arguments pour chaque sous-requête

    if (res.length > 0 && res[0].values[0]) {
      const v = res[0].values[0];
      const missingArgs = (minDate && maxDate) ? [minDate, maxDate] : [];
      let missingFilter = (minDate && maxDate) ? " AND a.date >= ? AND a.date <= ? " : "";

      const missingRes = db.exec(`SELECT a.date, p.nom, p.prenom, a.praticien, a.motif FROM appointments a JOIN patients p ON a.patient_id = p.id LEFT JOIN clinical_acts ca ON a.date = ca.date AND a.patient_id = ca.patient_id WHERE a.statut = 'Vu' AND ca.id IS NULL ${missingFilter} ORDER BY a.date DESC`, missingArgs);
      
      const vus = Number(v[0]) || 0;
      const matched = Number(v[3]) || 0;

      return {
        totalRDV: vus, production: v[1] || 0, encaissement: v[2] || 0, matched: matched, 
        missing: vus - matched, periodStr: "",
        missingList: missingRes.length > 0 ? missingRes[0].values.map((v: any) => ({ date: v[0], nom: v[1], prenom: v[2], praticien: v[3], motif: v[4] })) : []
      };
    }
    return { totalRDV: 0, production: 0, encaissement: 0, matched: 0, missing: 0, periodStr: "", missingList: [] };
  };

  const clearDB = async () => { 
    if (confirm("Effacer tout l'historique et les fiches ?")) { 
       const db = getDB();
       if (db) {
          db.run("DELETE FROM patients");
          db.run("DELETE FROM appointments");
          db.run("DELETE FROM clinical_acts");
          db.run("DELETE FROM import_logs");
          await saveDB(); 
          setStats(null); 
          setStatus({}); 
          setPreviews({ doctolib: [], logosw: [] }); 
          setHistory([]);
       }
    } 
  };

  const deleteImport = async (importId: string) => {
    if (!importId) {
      alert("Cet import est trop ancien pour être annulé unitairement. Vous devez réinitialiser la base entière.");
      return;
    }
    if (!confirm("Voulez-vous vraiment supprimer cet import ? Les données attachées à ce traitement spécifique vont être retirées.")) return;
    
    const db = getDB();
    if (!db) return;
    try {
      db.run("BEGIN TRANSACTION");
      db.run("DELETE FROM clinical_acts WHERE import_id = ?", [importId]);
      db.run("DELETE FROM appointments WHERE import_id = ?", [importId]);
      db.run("DELETE FROM import_logs WHERE import_id = ?", [importId]);
      db.run("COMMIT");
      await saveDB();
      loadHistory();
      setStats(null);
    } catch (e) {
      db.run("ROLLBACK");
      alert("Erreur lors de la suppression.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h1 style={{ fontSize: '1.875rem', fontWeight: 600 }}>Gestion des Imports</h1>
           <p style={{ color: 'var(--text-muted)' }}>Analysez et mémorisez vos flux financiers</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('history')}><HistoryIcon size={18} /> Historique</button>
          <button className={`btn ${activeTab === 'new' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('new')}><CheckCircle size={18} /> Nouvel Import</button>
          <button className="btn btn-outline" onClick={clearDB} style={{ color: 'var(--danger-text)', marginLeft: '1rem' }}>Réinitialiser</button>
        </div>
      </header>

      {activeTab === 'history' ? (
        <div className="card">
           <h3 style={{ marginBottom: '1.5rem' }}>Historique des analyses</h3>
           {history.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}> <FileText size={48} style={{ margin: '0 auto 1rem' }} /> <p>Aucun historique pour le moment</p> </div>
           ) : (
             <div className="table-container">
               <table>
                 <thead><tr><th>Date Import</th><th>Source / Période</th><th>Enregistrements</th><th>Honoraires réalisés</th><th>Montant encaissé</th><th style={{textAlign:'right'}}>Détails / Actions</th></tr></thead>
                 <tbody>
                   {history.map((h: any) => (
                     <tr key={h.id}>
                       <td>{new Date(h.timestamp).toLocaleString('fr-FR')}</td>
                       <td style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{h.source}</td>
                       <td style={{ fontWeight: 600 }}>{h.count}</td>
                       <td style={{ color: 'green' }}>{Number(h.prod).toLocaleString()} €</td>
                       <td style={{ color: '#3b82f6' }}>{Number(h.enc).toLocaleString()} €</td>
                       <td style={{textAlign:'right'}}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {h.anomalies && h.anomalies.length > 0 && (
                               <button onClick={() => setSelectedAnomalies(h.anomalies)} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--danger-border)', color: 'var(--danger-text)' }}>
                                 <ShieldAlert size={14} /> {h.anomalies.length} Anomalie(s)
                               </button>
                            )}
                            {h.import_id && (
                               <button onClick={() => deleteImport(h.import_id)} className="btn btn-ghost" style={{padding:'0.25rem', color:'var(--text-muted)'}} title="Supprimer cet import"><Trash2 size={16} /></button>
                            )}
                          </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {errorMsg && <div className="card" style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', display: 'flex', gap: '1rem', alignItems: 'center' }}><ShieldAlert /> {errorMsg}</div>}
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>1. Doctolib</h3>
              <div onClick={() => doctolibFileRef.current?.click()} style={{ border: '2px dashed #cbd5e1', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', borderRadius: '12px' }}>
                <input type="file" ref={doctolibFileRef} style={{ display: 'none' }} onChange={e => { setStats(null); e.target.files?.[0] && parseFile(e.target.files[0], 'doctolib'); }} />
                {loading.doctolib ? <Loader2 className="animate-spin" /> : <p>Importer Doctolib</p>}
              </div>
              {previews.doctolib.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '0.875rem' }}>
                   <div style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <Eye size={16} /> Structure détectée :
                   </div>
                   {previews.doctolib.map((col: any, i: number) => (
                     <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                       <span>{col.label}</span>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: col.found ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 500 }}>
                         <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: col.found ? 'var(--success-text)' : 'var(--danger-text)' }}></div>
                         {col.found ? 'Prêt' : 'Manquant'}
                       </div>
                     </div>
                   ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>2. LogosW</h3>
              <div onClick={() => logoswFileRef.current?.click()} style={{ border: '2px dashed #cbd5e1', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', borderRadius: '12px' }}>
                <input type="file" ref={logoswFileRef} style={{ display: 'none' }} onChange={e => { setStats(null); e.target.files?.[0] && parseFile(e.target.files[0], 'logosw'); }} />
                {loading.logosw ? <Loader2 className="animate-spin" /> : <p>Importer LogosW</p>}
              </div>
              {previews.logosw.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '0.875rem' }}>
                   <div style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <Eye size={16} /> Structure détectée :
                   </div>
                   {previews.logosw.map((col: any, i: number) => (
                     <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                       <span>{col.label}</span>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: col.found ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 500 }}>
                         <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: col.found ? 'var(--success-text)' : 'var(--danger-text)' }}></div>
                         {col.found ? 'Prêt' : 'Manquant'}
                       </div>
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>

          {(status.doctolib === 'success' && status.logosw === 'success' && !stats) && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              {progress && <p style={{ marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}><Loader2 className="animate-spin" size={16} style={{ display: 'inline', marginRight: '8px' }} /> {progress}</p>}
              <button className="btn btn-primary btn-lg" onClick={injectToDatabase} disabled={loading.global} style={{ padding: '1rem 3rem' }}>Lancer le Croisement</button>
            </div>
          )}

          {stats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
               <div style={{ padding: '1rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <CheckCircle size={20} />
                 Rapport d'analyse généré {stats.periodStr ? `(${stats.periodStr})` : ''}
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  <div className="card"><h4>Vus</h4><p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalRDV}</p></div>
                  <div className="card" style={{ borderLeft: '4px solid green' }}><h4>Honoraires réalisés</h4><p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'green' }}>{stats.production.toLocaleString()} €</p></div>
                  <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}><h4>Montant encaissé</h4><p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{stats.encaissement.toLocaleString()} €</p></div>
                  <div className="card" style={{ borderLeft: '4px solid red' }}><h4>Défauts</h4><p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'red' }}>{stats.missing}</p></div>
               </div>
               {stats.missingList.length > 0 && (
                 <div className="card">
                    <h3 style={{ color: 'red', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldAlert /> Anomalies de facturation (Rendez-vous sans actes)
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                      Il s'agit des rendez-vous notés comme <strong>"Vu"</strong> dans Doctolib, mais pour lesquels nous n'avons trouvé <strong>absolument aucun acte ni règlement enregistré à cette même date</strong> dans le fichier LogosW.<br/>
                      Cela peut indiquer un oubli de saisie de l'acte par le praticien, ou une facturation décalée de quelques jours.
                    </p>
                    <div className="table-container" style={{ maxHeight: '400px' }}>
                      <table>
                        <thead><tr><th>Date du RDV</th><th>Patient concerné</th><th>Praticien (Doctolib)</th><th>Motif Doctolib</th></tr></thead>
                        <tbody>
                          {stats.missingList.map((m: any, i: number) => (
                            <tr key={i}>
                               <td>{m.date}</td>
                               <td style={{ fontWeight: 600 }}>{m.nom} {m.prenom}</td>
                               <td style={{ color: 'var(--primary)', fontWeight: 500 }}>{m.praticien}</td>
                               <td>{m.motif}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>
      )}

      {selectedAnomalies && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--danger-text)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <ShieldAlert /> Détail des anomalies ({selectedAnomalies.length})
                </h2>
                <button className="btn btn-ghost" onClick={() => setSelectedAnomalies(null)} style={{ padding: '0.5rem' }}>✖</button>
             </div>
             <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Ces patients ont été marqués comme <strong>"Vu"</strong> dans Doctolib à la date indiquée, mais l'analyse du fichier comptable (LogosW) n'a trouvé <strong>aucun acte et aucun paiement facturé</strong> pour ce même patient et cette même date.
             </p>
             <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Date du RDV</th><th>Patient</th><th>Praticien</th><th>Diagnostic / Piste suggérée</th></tr></thead>
                  <tbody>
                    {selectedAnomalies.map((m: any, i: number) => {
                      const motifLower = (m.motif || '').toLowerCase();
                      let hint = "Oubli de facture, dossier LogosW non clôturé, ou erreur d'homonyme.";
                      if (motifLower.includes('consultation') || motifLower.includes('bilan')) hint = "Simple contrôle gratuit non tracé ou oubli du code consultation.";
                      else if (motifLower.includes('urgence')) hint = "Patient reçu en urgence sans acte associé ou traité sans frais.";
                      else if (motifLower.includes('détartrage') || motifLower.includes('soin')) hint = "Oubli de validation de l'acte de soin dans le schéma dentaire LogosW.";
                      else if (motifLower.includes('implant') || motifLower.includes('prothèse')) hint = "Devis en cours, ou acompte non saisi dans le livre de caisse.";
                      else if (motifLower.includes('contrôle') || motifLower.includes('suite')) hint = "Rendez-vous de suivi potentiellement non facturable.";

                      return (
                        <tr key={i}>
                           <td style={{ whiteSpace: 'nowrap' }}>{m.date}</td>
                           <td style={{ fontWeight: 600 }}>{m.nom} {m.prenom}</td>
                           <td style={{ color: 'var(--primary)', whiteSpace: 'nowrap' }}>{m.praticien}</td>
                           <td>
                             <span style={{ fontWeight: 500, color: 'var(--danger-text)', display: 'block' }}>{hint}</span>
                             <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RDV initial : "{m.motif}"</span>
                           </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
