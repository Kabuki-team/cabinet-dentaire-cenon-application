import { useState, useRef, useEffect } from 'react';
import { Loader2, ShieldAlert, History as HistoryIcon, FileText, CheckCircle, CheckCircle2, XCircle, Trash2, UploadCloud, X, BookOpen, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getDB, saveDB } from '../lib/db';
import { calculateSimilarity } from '../lib/similarity';
import { toISODate, formatToFrench } from '../lib/dateUtils';

export function Imports() {
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [status, setStatus] = useState<{ [key: string]: 'success' | 'error' | null }>({});
  const [previews, setPreviews] = useState<{ doctolib: any[], logosw: any[], logosw_patients: any[] }>({ doctolib: [], logosw: [], logosw_patients: [] });
  const [rawData, setRawData] = useState<{ doctolib: any[], logosw: any[], logosw_patients: any[] }>({ doctolib: [], logosw: [], logosw_patients: [] });
  const [stats, setStats] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedAnomalies, setSelectedAnomalies] = useState<any[] | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [fileNames, setFileNames] = useState<{ doctolib: string; logosw: string; logosw_patients: string }>({ doctolib: '', logosw: '', logosw_patients: '' });
  const [dragOver, setDragOver] = useState<{ [key: string]: boolean }>({});
  const [openGuideSection, setOpenGuideSection] = useState<string | null>(null);

  const doctolibFileRef = useRef<HTMLInputElement>(null);
  const logoswFileRef = useRef<HTMLInputElement>(null);
  const logoswPatientsRef = useRef<HTMLInputElement>(null);

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


  const normalizeName = (str: string) => {
    if (!str) return "";
    return String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 0).sort().join(" ");
  };

  const getMappedValue = (row: any, userKey: string) => {
    if (!row) return null;
    if (row[userKey] !== undefined) return row[userKey];
    const keys = Object.keys(row);
    const foundKey = keys.find(k => k.toLowerCase().trim() === userKey.toLowerCase().trim());
    if (foundKey) return row[foundKey];

    // SCAN PROFOND pour les dates de naissance si non trouvée par en-tête
    const lKey = userKey.toLowerCase();
    if (lKey.includes("naissance") || lKey.includes("né le") || lKey.includes("ddn")) {
       for (const k of keys) {
          const val = String(row[k] || "").trim();
          // Regex pour détecter AAAA-MM-JJ ou JJ/MM/AAAA
          if (/^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{2}\/\d{2}\/\d{4}/.test(val)) {
             return val;
          }
       }
    }
    return null;
  };

  const parseFile = (file: File, type: 'doctolib' | 'logosw' | 'logosw_patients') => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setErrorMsg(`Format non supporté : « .${ext} ». Seuls les fichiers CSV et Excel (.xlsx, .xls) sont acceptés.`);
      setFileNames(p => ({ ...p, [type]: null }));
      setLoading(prev => ({ ...prev, [type]: false }));
      return;
    }
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
        // cellDates:false → SheetJS garde les dates comme numéros Excel bruts
        // raw:false + dateNF → les cellules dates sont formatées en YYYY-MM-DD (string pure, sans timezone)
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd' });
        setRawData(prev => ({ ...prev, [type]: data }));
        processPreview(data, type);
      }
    };

    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, "UTF-8");
    else reader.readAsBinaryString(file);
  };

  const processPreview = (data: any[], type: 'doctolib' | 'logosw' | 'logosw_patients') => {
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
    } else if (type === 'logosw_patients') {
      validations = [
        { label: 'Numéro de Dossier', found: hasKey(['numéro', 'numero', 'dossier']) },
        { label: 'Identité (Nom/Prénom)', found: hasKey(['nom', 'patient', 'identité']) },
        { label: 'Date de naissance', found: hasKey(['naissance', 'né le', 'nee le']) },
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
       // --- MIGRATION: Normaliser TOUTES les dates de naissance existantes en ISO ---
       setProgress("Normalisation des dates de naissance...");
       const allDobs = db.exec("SELECT id, date_naissance FROM patients WHERE date_naissance IS NOT NULL AND date_naissance != ''");
       if (allDobs.length > 0) {
         let fixed = 0;
         allDobs[0].values.forEach((row: any) => {
           const rawDate = String(row[1]);
           let corrected = "";
           
           // Pattern corrompu: "2018-07-1995" → le vrai format est 18/07/1995
           // Détection: 3e partie a 4+ chiffres ET 1re partie de longueur 4 commence par "20" 
           // mais la 3e partie ressemble à une année (19xx ou 20xx valide)
           const corruptMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{4})$/);
           if (corruptMatch) {
             const p2 = parseInt(corruptMatch[3]); // ex: 1995
             // Si la 3e partie est une année plausible (1900-2026) et la 1re dépasse 2026
             // OU si la 3e partie commence par 19xx → c'est inversé
             if (p2 >= 1900 && p2 <= 2026) {
               const realDay = corruptMatch[1].substring(2); // "18" from "2018"
               const realMonth = corruptMatch[2]; // "07"
               corrected = `${corruptMatch[3]}-${realMonth}-${realDay}`;
             }
           }
           
           // Si pas de pattern corrompu, essayer formatDate normal
           if (!corrected) {
             const isoDate = toISODate(rawDate);
             if (isoDate && isoDate !== rawDate) {
               corrected = isoDate;
             }
           }
           
           if (corrected && corrected !== rawDate) {
             db.run("UPDATE patients SET date_naissance = ? WHERE id = ?", [corrected, row[0]]);
             fixed++;
             if (fixed <= 10) console.log(`🔧 Date corrigée: "${rawDate}" → "${corrected}"`);
           }
         });
         if (fixed > 0) console.log(`🔧 Migration: ${fixed} date(s) de naissance corrigée(s)`);
       }
       // --- ÉTAPE DE NETTOYAGE (Option A) ---
       // On identifie toutes les dates présentes dans les fichiers pour les nettoyer avant injection
       const datesToClean = new Set<string>();
       rawData.doctolib.forEach(row => {
         const d = toISODate(getMappedValue(row, "Doctolib Patient ID_1") || getMappedValue(row, "Date de début"));
         if (d) datesToClean.add(d);
       });
       rawData.logosw.forEach(row => {
         const d = toISODate(getMappedValue(row, "Date"));
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

         const nom = getMappedValue(row, "Nom du patient") || getMappedValue(row, "Nom") || "";
         const prenom = getMappedValue(row, "Prénom du patient") || getMappedValue(row, "Prénom") || "";
         const norm = normalizeName(`${nom} ${prenom}`);
         
         // Détection robuste de la date de naissance Doctolib
         const rawDob = getMappedValue(row, "Date de naissance")
           || getMappedValue(row, "Né(e) le")
           || getMappedValue(row, "Né le")
           || getMappedValue(row, "DDN")
           || getMappedValue(row, "Date naissance")
           || getMappedValue(row, "Date de naissance du patient")
           || getMappedValue(row, "Patient - Date de naissance");
           
         const bDate = toISODate(rawDob);
         
         // Log pour déboguer les premiers patients
         if (rawData.doctolib.indexOf(row) < 5) {
           console.log(`👨‍⚕️ Import Doctolib [${rawData.doctolib.indexOf(row)}]: ${nom} ${prenom} | Colonne brute="${rawDob}" → ISO="${bDate}"`);
         }

         db.run(`INSERT INTO patients (doctolib_id, civilite, nom, prenom, nom_complet_norm, nom_doctolib, nom_naissance, date_naissance, email, telephone, adresse, code_postal, ville)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(doctolib_id) DO UPDATE SET
                 nom=excluded.nom, prenom=excluded.prenom, nom_complet_norm=excluded.nom_complet_norm, nom_doctolib=excluded.nom_doctolib, nom_naissance=excluded.nom_naissance, date_naissance=excluded.date_naissance, telephone=excluded.telephone, email=excluded.email, adresse=excluded.adresse, civilite=excluded.civilite, code_postal=excluded.code_postal, ville=excluded.ville`,
                [pIdEx, getMappedValue(row, "Civilité"), nom, prenom, norm, `${nom} ${prenom}`, getMappedValue(row, "Nom de naissance"), bDate, getMappedValue(row, "Email du patient"), getMappedValue(row, "Téléphone portable"), getMappedValue(row, "Adresse"), getMappedValue(row, "Code postal"), getMappedValue(row, "Ville")]);

         const pIdRes = db.exec(`SELECT id FROM patients WHERE doctolib_id = ?`, [pIdEx]);
         const pIdInternal = pIdRes[0]?.values[0][0];

         const visitDate = toISODate(getMappedValue(row, "Doctolib Patient ID_1") || getMappedValue(row, "Date de début"));
         db.run(`INSERT INTO appointments (appointment_uid, patient_id, date, heure, praticien, motif, statut, import_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [getMappedValue(row, "Id") || Math.random().toString(), pIdInternal, visitDate, getMappedValue(row, "Début") || "", getMappedValue(row, "Agenda") || "", getMappedValue(row, "Motif du RDV") || "", getMappedValue(row, "Statut") || "", importId]);
       }

       // 2. LOGOSW
       setProgress("Analyse des flux financiers LogosW...");
       const LOGOSW_BLACKLIST = ['total', 'honoraires', 'reglement', 'réglement', 'règlement', 'logosw', 'grand total'];
       
       // Indexation du dictionnaire et sauvegarde persistante
       const logosLookup = new Map<string, any>();
       if (rawData.logosw_patients) {
         db.run("DELETE FROM logosw_dictionary"); // On rafraîchit le dictionnaire à chaque import
         
         // DEBUG: Afficher les noms de colonnes du premier enregistrement
         if (rawData.logosw_patients.length > 0) {
           const sampleKeys = Object.keys(rawData.logosw_patients[0]);
           console.group("📋 Dictionnaire LogosW - Debug");
           console.log("Colonnes détectées:", sampleKeys.join(", "));
           const sample = rawData.logosw_patients[0];
           console.log("Exemple ligne 1:", JSON.stringify(sample));
         }
         
         let dictInserted = 0;
         let dictNoDob = 0;
         
         rawData.logosw_patients.forEach((p, idx) => {
            let nom = (getMappedValue(p, "Nom") || getMappedValue(p, "Patient") || "").trim();
            let prenom = (getMappedValue(p, "Prénom") || getMappedValue(p, "Prenom") || "").trim();
            
            if (!prenom && nom.includes(" ")) {
              const pts = nom.split(" ");
              nom = pts[0];
              prenom = pts.slice(1).join(" ");
            }
            const n = normalizeName(nom + " " + prenom);
            logosLookup.set(n, p);
            const dos = String(getMappedValue(p, "Numéro") || getMappedValue(p, "Numero") || getMappedValue(p, "Dossier") || getMappedValue(p, "N°") || "").trim();
            if (dos) {
              logosLookup.set(dos, p);
              
              // Tentative de récupération de la date de naissance avec TOUS les noms possibles
              const rawDob = getMappedValue(p, "Naissance") 
                || getMappedValue(p, "Né le") 
                || getMappedValue(p, "Nee le") 
                || getMappedValue(p, "Date de naissance")
                || getMappedValue(p, "Date naissance")
                || getMappedValue(p, "DDN")
                || getMappedValue(p, "Né(e) le");
              
              const bDate = toISODate(rawDob);
              
              // Log les 5 premiers pour debug
              if (idx < 5) {
                console.log(`  Patient ${dos}: "${nom} ${prenom}" | DDN brute="${rawDob}" → FR="${formatToFrench(bDate)}"`);
              }
              
              if (bDate) {
                dictInserted++;
              } else {
                dictNoDob++;
              }
              
              db.run("INSERT OR REPLACE INTO logosw_dictionary (dossier_id, nom, prenom, nom_complet_norm, date_naissance) VALUES (?, ?, ?, ?, ?)",
                     [dos, nom, prenom, n, bDate]);
            }
         });
         
         console.log(`📊 Dictionnaire: ${dictInserted} avec DDN, ${dictNoDob} sans DDN, ${rawData.logosw_patients.length} total`);
         console.groupEnd();
       }

       for (const row of rawData.logosw) {
         const label = String(getMappedValue(row, "Patient") || "").trim();
         if (!label || LOGOSW_BLACKLIST.some(kw => label.toLowerCase().includes(kw))) continue;

         const norm = normalizeName(label);
         const visitDate = toISODate(getMappedValue(row, "Date"));
         
         const dosId = String(getMappedValue(row, "Dossier") || getMappedValue(row, "Doss") || getMappedValue(row, "N° Dossier") || "").trim();
         
         let pId = null;

         // Prio 1 : Recherche par ID Dossier
         if (dosId) {
            const res = db.exec(`SELECT id FROM patients WHERE dossier_logosw = ?`, [dosId]);
            if (res.length > 0) pId = res[0].values[0][0];
         }

         // Prio 2 : Recherche par nom
         if (!pId) {
            // Tentative 1 : Nom complet exact ou Nom LogosW déjà connu ou Nom de naissance + Prénom
            let pIdRes = db.exec(`
               SELECT id FROM patients 
               WHERE nom_complet_norm = ? 
               OR nom_logosw = ? 
               OR (LOWER(nom_naissance) || ' ' || LOWER(prenom)) = ?
               OR (LOWER(prenom) || ' ' || LOWER(nom_naissance)) = ?
            `, [norm, label, norm, norm]);
            pId = pIdRes[0]?.values[0][0];
            
            if (pId && dosId) {
               db.run(`UPDATE patients SET dossier_logosw = ? WHERE id = ? AND (dossier_logosw IS NULL OR dossier_logosw = '')`, [dosId, pId]);
            }
         }

         if (!pId && logosLookup.size > 0) {
            // On cherche dans le dictionnaire bridge par Nom OU par ID Dossier (le plus sûr)
            const dictP = (dosId ? logosLookup.get(dosId) : null) || logosLookup.get(norm);
            
            if (dictP) {
               const bDate = toISODate(getMappedValue(dictP, "Naissance") || getMappedValue(dictP, "Né le") || getMappedValue(dictP, "Nee le"));
               const dos = String(getMappedValue(dictP, "Numéro") || getMappedValue(dictP, "Numero") || "");
               const nomLogosBridge = ((getMappedValue(dictP, "Nom") || getMappedValue(dictP, "Patient") || "") + " " + (getMappedValue(dictP, "Prénom") || getMappedValue(dictP, "Prenom") || "")).trim();
               const normBridge = normalizeName(nomLogosBridge);

               if (bDate && bDate.length > 8) {
                  const search = db.exec(`SELECT id, nom, prenom FROM patients WHERE date_naissance = ?`, [bDate]);
                  if (search.length > 0) {
                     if (search[0].values.length === 1) {
                        // Match parfait par date (unique)
                        pId = search[0].values[0][0];
                     } else {
                        // Plusieurs suspects avec la même date : on cherche celui qui ressemble le plus au nom LogosW
                        const bridgeWords = normBridge.split(' ');
                        let bestMatch = null;
                        let maxHits = 0;
                        
                        search[0].values.forEach((v: any) => {
                           const dbName = normalizeName(`${v[1]} ${v[2]}`);
                           const hits = bridgeWords.filter(w => dbName.includes(w)).length;
                           if (hits > maxHits) {
                              maxHits = hits;
                              bestMatch = v[0];
                           }
                        });
                        
                        if (maxHits >= 1) pId = bestMatch;
                     }
                     
                     if (pId) {
                        db.run(`UPDATE patients SET nom_logosw = ?, dossier_logosw = ?, has_warning = 1 WHERE id = ?`, [label, dos, pId]);
                     }
                  }
               }
               
               // Fallback final : Si pas de date, on cherche par le nom du pont
               if (!pId && normBridge) {
                  const search = db.exec(`SELECT id FROM patients WHERE nom_complet_norm = ?`, [normBridge]);
                  if (search.length > 0) {
                     pId = search[0].values[0][0];
                     db.run(`UPDATE patients SET dossier_logosw = ?, nom_logosw = ? WHERE id = ? AND (dossier_logosw IS NULL OR dossier_logosw = '')`, [dos, label, pId]);
                  }
               }
            }
         }

         if (!pId && visitDate) {
            const preSearch = normalizeName(label.split(' ').pop() || label);
            if (preSearch.length > 2) {
               const appToday = db.exec(`SELECT patient_id FROM appointments WHERE date = ?`, [visitDate]);
               if (appToday.length > 0 && appToday[0].values.length > 0) {
                  const ids = appToday[0].values.map((v: any) => v[0]).join(',');
                  const mRes = db.exec(`SELECT id FROM patients WHERE id IN (${ids}) AND (nom_complet_norm LIKE ? OR prenom LIKE ?)`, 
                                       [`%${preSearch}%`, `%${label.split(' ').pop()}%`]);
                  if (mRes.length > 0 && mRes[0].values.length === 1) {
                     pId = mRes[0].values[0][0];
                     db.run(`UPDATE patients SET has_warning = 1, nom_logosw = ? WHERE id = ?`, [label, pId]);
                  }
               }
            }
         }

         if (!pId) {
            db.run(`INSERT INTO patients (nom, nom_complet_norm, nom_logosw, dossier_logosw) VALUES (?, ?, ?, ?)`, [label, norm, label, dosId]);
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
       // === PASSE DE RÉCONCILIATION FINALE ===
       setProgress("Réconciliation finale des identités...");
       if (rawData.logosw_patients && rawData.logosw_patients.length > 0) {
          console.group("🔍 Passe de réconciliation finale");
          
          // === DIAGNOSTIC: Voir ce qui est RÉELLEMENT dans la table patients ===
          const sampleDates = db.exec("SELECT id, nom, prenom, date_naissance FROM patients LIMIT 10");
          if (sampleDates.length > 0) {
            console.group("📊 DIAGNOSTIC - Dates de naissance dans la table patients:");
            sampleDates[0].values.forEach((v: any) => console.log(`  Patient #${v[0]}: ${v[1]} ${v[2]} → DDN="${v[3]}" (type: ${typeof v[3]}, length: ${String(v[3] || '').length})`));
            console.groupEnd();
          }
          const totalWithDob = db.exec("SELECT COUNT(*) FROM patients WHERE date_naissance IS NOT NULL AND date_naissance != '' AND length(date_naissance) >= 8");
          const totalPatients = db.exec("SELECT COUNT(*) FROM patients");
          console.log(`📊 Patients total: ${totalPatients[0]?.values[0][0]}, avec DDN valide: ${totalWithDob[0]?.values[0][0]}`);
          
          let reconciled = 0;
          const stmtSearch = db.prepare("SELECT id, nom, prenom, nom_naissance, dossier_logosw FROM patients WHERE date_naissance = ?");
          const stmtUpdate = db.prepare("UPDATE patients SET dossier_logosw = ?, nom_logosw = ?, has_warning = 0 WHERE id = ?");

          for (const p of rawData.logosw_patients) {
             const dos = String(getMappedValue(p, "Numéro") || getMappedValue(p, "Numero") || "").trim();
             if (!dos) continue;
             
             // Déjà lié ?
             const alreadyRes = db.exec(`SELECT id FROM patients WHERE dossier_logosw = ?`, [dos]);
             if (alreadyRes.length > 0 && alreadyRes[0].values.length > 0) continue;

             const logosNom = String(getMappedValue(p, "Nom") || getMappedValue(p, "Patient") || "").trim();
             const logosPrenom = String(getMappedValue(p, "Prénom") || getMappedValue(p, "Prenom") || "").trim();
             const bDate = toISODate(getMappedValue(p, "Naissance") || getMappedValue(p, "Né le") || getMappedValue(p, "Nee le") || getMappedValue(p, "Date de naissance"));
             
             if (!bDate) continue;
             
             stmtSearch.bind([bDate]);
             const candidates = [];
             while(stmtSearch.step()) {
               candidates.push(stmtSearch.get());
             }
             stmtSearch.reset();
             
             if (candidates.length === 0) continue;
             
             let bestCandidate = null;
             let bestScore = 0;
             
             for (const cand of candidates) {
               // cand: [id, nom, prenom, nom_naissance, dossier_logosw]
               if (cand[4]) continue; // Déjà lié

               const nameLogos = `${logosNom} ${logosPrenom}`;
               const nameDoctolib = `${cand[1]} ${cand[2]} ${cand[3] || ''}`;
               const score = calculateSimilarity(nameLogos, nameDoctolib);
               
               if (score > bestScore) {
                 bestScore = score;
                 bestCandidate = cand;
               }
             }
             
             // Seuil de confiance automatique élevé (95%)
             // Si un seul candidat avec un score correct (> 70%), on lie aussi
             if (bestCandidate && (bestScore >= 95 || (candidates.length === 1 && bestScore >= 70))) {
               stmtUpdate.run([dos, `${logosNom} ${logosPrenom}`, bestCandidate[0]]);
               reconciled++;
             }
          }
          stmtSearch.free();
          stmtUpdate.free();
          
          console.log(`📊 Réconciliation terminée : ${reconciled} patient(s) liés automatiquement`);
          console.groupEnd();
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
         ? `Du ${formatToFrench(minDateStr)} au ${formatToFrench(maxDateStr)}` 
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
     const db = getDB();
     if (db) {
        try {
           db.run("DELETE FROM patients");
           db.run("DELETE FROM appointments");
           db.run("DELETE FROM clinical_acts");
           db.run("DELETE FROM import_logs");
           db.run("DELETE FROM patient_annotations");
           await saveDB(); 
           setStats(null); 
           setStatus({}); 
           setPreviews({ doctolib: [], logosw: [], logosw_patients: [] }); 
           setRawData({ doctolib: [], logosw: [], logosw_patients: [] });
           setHistory([]);
           setShowResetModal(false);
           alert("Base de données réinitialisée.");
        } catch (e) {
           console.error("Erreur réinitialisation:", e);
           alert("Erreur lors de la réinitialisation.");
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Imports</h1>
          <p style={{ color: 'var(--text-muted)' }}>Chargez vos fichiers Doctolib et LogosW pour mettre à jour les données du cabinet.</p>
        </div>
        <button className="btn btn-outline" onClick={() => setShowResetModal(true)} style={{ color: 'var(--danger-text)' }}><Trash2 size={16} /> Réinitialiser toutes les données</button>
      </div>

      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowResetModal(false)}>
          <div className="card" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }} onClick={e => e.stopPropagation()}>
            <Trash2 size={48} color="var(--danger-text)" style={{ margin: '0 auto 1.5rem' }} />
            <h2 style={{ marginBottom: '1rem' }}>Réinitialisation totale</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Souhaitez-vous vraiment effacer TOUTES les données (patients, rendez-vous, actes et historique) ? Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowResetModal(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--primary)' }} onClick={clearDB}>Tout effacer</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {errorMsg && (
            <div style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem 1.25rem', borderRadius: '0.75rem', border: '1px solid var(--danger)', fontSize: '0.875rem' }}>
              <ShieldAlert size={18} style={{ flexShrink: 0 }} /> {errorMsg}
              <button onClick={() => setErrorMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-text)' }}><X size={16} /></button>
            </div>
          )}

          {/* Zone d'upload — 3 colonnes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
            {/* Doctolib */}
            {(() => {
              const type = 'doctolib';
              const allReady = previews[type].length > 0 && previews[type].every((c: any) => c.found);
              const hasError = previews[type].length > 0 && previews[type].some((c: any) => !c.found);
              const borderColor = allReady ? 'var(--success)' : hasError ? 'var(--danger)' : dragOver[type] ? 'var(--primary)' : '#cbd5e1';
              const bgColor = dragOver[type] ? 'var(--primary-light)' : 'transparent';
              return (
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Étape 1</span>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Agenda Doctolib</h3>
                    </div>
                    {allReady && <CheckCircle2 size={20} color="var(--success)" />}
                    {hasError && <XCircle size={20} color="var(--danger)" />}
                  </div>
                  <div
                    onClick={() => doctolibFileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(p => ({ ...p, [type]: true })); }}
                    onDragLeave={() => setDragOver(p => ({ ...p, [type]: false }))}
                    onDrop={e => { e.preventDefault(); setDragOver(p => ({ ...p, [type]: false })); const f = e.dataTransfer.files[0]; if (f) { setStats(null); setFileNames(p => ({ ...p, [type]: f.name })); parseFile(f, type); } }}
                    style={{ border: `2px dashed ${borderColor}`, padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer', borderRadius: '0.75rem', backgroundColor: bgColor, transition: 'all 0.2s' }}
                  >
                    <input type="file" accept=".csv,.xlsx,.xls" ref={doctolibFileRef} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setStats(null); setFileNames(p => ({ ...p, [type]: f.name })); parseFile(f, type); e.target.value = ''; } }} />
                    {loading[type] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                        <Loader2 size={24} className="animate-spin" />
                        <span style={{ fontSize: '0.8rem' }}>Analyse en cours...</span>
                      </div>
                    ) : fileNames[type] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <FileText size={20} color="var(--primary)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{fileNames[type]}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cliquer pour changer</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        <UploadCloud size={24} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Glisser ou cliquer</span>
                        <span style={{ fontSize: '0.7rem' }}>.csv · .xlsx</span>
                      </div>
                    )}
                  </div>
                  {previews[type].length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {previews[type].map((col: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{col.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: col.found ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600 }}>
                            {col.found ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            {col.found ? 'OK' : 'Manquant'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* LogosW */}
            {(() => {
              const type = 'logosw';
              const allReady = previews[type].length > 0 && previews[type].every((c: any) => c.found);
              const hasError = previews[type].length > 0 && previews[type].some((c: any) => !c.found);
              const borderColor = allReady ? 'var(--success)' : hasError ? 'var(--danger)' : dragOver[type] ? 'var(--primary)' : '#cbd5e1';
              const bgColor = dragOver[type] ? 'var(--primary-light)' : 'transparent';
              return (
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Étape 2</span>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Comptabilité LogosW</h3>
                    </div>
                    {allReady && <CheckCircle2 size={20} color="var(--success)" />}
                    {hasError && <XCircle size={20} color="var(--danger)" />}
                  </div>
                  <div
                    onClick={() => logoswFileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(p => ({ ...p, [type]: true })); }}
                    onDragLeave={() => setDragOver(p => ({ ...p, [type]: false }))}
                    onDrop={e => { e.preventDefault(); setDragOver(p => ({ ...p, [type]: false })); const f = e.dataTransfer.files[0]; if (f) { setStats(null); setFileNames(p => ({ ...p, [type]: f.name })); parseFile(f, type); } }}
                    style={{ border: `2px dashed ${borderColor}`, padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer', borderRadius: '0.75rem', backgroundColor: bgColor, transition: 'all 0.2s' }}
                  >
                    <input type="file" accept=".csv,.xlsx,.xls" ref={logoswFileRef} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setStats(null); setFileNames(p => ({ ...p, [type]: f.name })); parseFile(f, type); e.target.value = ''; } }} />
                    {loading[type] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                        <Loader2 size={24} className="animate-spin" />
                        <span style={{ fontSize: '0.8rem' }}>Analyse en cours...</span>
                      </div>
                    ) : fileNames[type] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <FileText size={20} color="var(--primary)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{fileNames[type]}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cliquer pour changer</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        <UploadCloud size={24} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Glisser ou cliquer</span>
                        <span style={{ fontSize: '0.7rem' }}>.csv · .xlsx</span>
                      </div>
                    )}
                  </div>
                  {previews[type].length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {previews[type].map((col: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{col.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: col.found ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600 }}>
                            {col.found ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            {col.found ? 'OK' : 'Manquant'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* LogosW Patients (optionnel) */}
            {(() => {
              const type = 'logosw_patients';
              const allReady = previews[type].length > 0 && previews[type].every((c: any) => c.found);
              const hasError = previews[type].length > 0 && previews[type].some((c: any) => !c.found);
              const borderColor = allReady ? 'var(--success)' : hasError ? 'var(--danger)' : dragOver[type] ? 'var(--primary)' : '#cbd5e1';
              const bgColor = dragOver[type] ? 'var(--primary-light)' : 'transparent';
              return (
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.85 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Optionnel</span>
                        <span style={{ fontSize: '0.65rem', backgroundColor: 'var(--accent-light)', color: 'var(--warning-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Dictionnaire</span>
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Base Patients LogosW</h3>
                    </div>
                    {allReady && <CheckCircle2 size={20} color="var(--success)" />}
                    {hasError && <XCircle size={20} color="var(--danger)" />}
                  </div>
                  <div
                    onClick={() => logoswPatientsRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(p => ({ ...p, [type]: true })); }}
                    onDragLeave={() => setDragOver(p => ({ ...p, [type]: false }))}
                    onDrop={e => { e.preventDefault(); setDragOver(p => ({ ...p, [type]: false })); const f = e.dataTransfer.files[0]; if (f) { setStats(null); setFileNames(p => ({ ...p, [type]: f.name })); parseFile(f, type); } }}
                    style={{ border: `2px dashed ${borderColor}`, padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer', borderRadius: '0.75rem', backgroundColor: bgColor, transition: 'all 0.2s' }}
                  >
                    <input type="file" accept=".csv,.xlsx,.xls" ref={logoswPatientsRef} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setStats(null); setFileNames(p => ({ ...p, [type]: f.name })); parseFile(f, type); e.target.value = ''; } }} />
                    {loading[type] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                        <Loader2 size={24} className="animate-spin" />
                        <span style={{ fontSize: '0.8rem' }}>Analyse en cours...</span>
                      </div>
                    ) : fileNames[type] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <FileText size={20} color="var(--primary)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{fileNames[type]}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cliquer pour changer</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                        <UploadCloud size={24} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Glisser ou cliquer</span>
                        <span style={{ fontSize: '0.7rem' }}>.csv · .xlsx — améliore le matching patient</span>
                      </div>
                    )}
                  </div>
                  {previews[type].length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {previews[type].map((col: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{col.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: col.found ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600 }}>
                            {col.found ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            {col.found ? 'OK' : 'Manquant'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {(status.doctolib === 'success' && status.logosw === 'success' && !stats) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
              {progress && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)', fontWeight: 500, fontSize: '0.875rem' }}>
                  <Loader2 className="animate-spin" size={18} /> {progress}
                </div>
              )}
              <button className="btn btn-primary" onClick={injectToDatabase} disabled={loading.global} style={{ padding: '0.875rem 3rem', fontSize: '1rem', fontWeight: 600 }}>
                {loading.global ? <><Loader2 className="animate-spin" size={18} /> Traitement en cours...</> : <><CheckCircle size={18} /> Lancer l'import</>}
              </button>
            </div>
          )}

          {stats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
               <div style={{ padding: '1rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <CheckCircle size={20} />
                 Rapport d'analyse généré {stats.periodStr ? `(${stats.periodStr})` : ''}
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  <div className="card"><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>RDV vus</p><p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalRDV}</p></div>
                  <div className="card" style={{ borderLeft: '4px solid var(--success)' }}><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Honoraires réalisés</p><p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-text)' }}>{Number(stats.production).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p></div>
                  <div className="card" style={{ borderLeft: '4px solid var(--info)' }}><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Montant encaissé</p><p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info-text)' }}>{Number(stats.encaissement).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p></div>
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Anomalies</p><p style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.missing > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>{stats.missing}</p></div>
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
                        <thead><tr><th>Date du RDV</th><th>Patient concerné</th><th>Praticien (Doctolib)</th><th>Motif de l'anomalie</th></tr></thead>
                        <tbody>
                          {stats.missingList.map((m: any, i: number) => {
                             const motifLower = (m.motif || '').toLowerCase();
                             let hint = "Oubli de facture ou soin non validé.";
                             if (motifLower.includes('consultation') || motifLower.includes('bilan')) hint = "Consultation sans acte associé (oubli ?)";
                             else if (motifLower.includes('urgence')) hint = "Urgence reçue sans acte ou traité sans frais.";
                             else if (motifLower.includes('détartrage') || motifLower.includes('soin')) hint = "Oubli de validation de l'acte de soin.";
                             else if (motifLower.includes('implant') || motifLower.includes('prothèse')) hint = "Devis/Acompte manquant ou acte non clôturé.";
                             else if (motifLower.includes('contrôle') || motifLower.includes('suite')) hint = "Rendez-vous de suivi potentiellement non facturable.";
                             
                             return (
                               <tr key={i}>
                                  <td>{m.date}</td>
                                  <td style={{ fontWeight: 600 }}>{m.nom} {m.prenom}</td>
                                  <td style={{ color: 'var(--primary)', fontWeight: 500 }}>{m.praticien}</td>
                                  <td>
                                    <span style={{ fontWeight: 600, color: 'var(--danger-text)' }}>{hint}</span>
                                    {m.motif && <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.7 }}>RDV initial: {m.motif}</span>}
                                  </td>
                               </tr>
                             );
                          })}
                        </tbody>
                      </table>
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Historique des imports — toujours visible */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <HistoryIcon size={18} color="var(--text-muted)" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Historique des imports</h3>
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{history.length} entrée{history.length !== 1 ? 's' : ''}</span>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', opacity: 0.5 }}>
              <FileText size={36} style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ fontSize: '0.875rem' }}>Aucun import effectué pour le moment</p>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source / Période</th>
                    <th>Enregistrements</th>
                    <th style={{ textAlign: 'right' }}>Honoraires</th>
                    <th style={{ textAlign: 'right' }}>Encaissé</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any) => (
                    <tr key={h.id}>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(h.timestamp).toLocaleString('fr-FR')}</td>
                      <td style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{h.source}</td>
                      <td style={{ fontWeight: 600 }}>{h.count}</td>
                      <td style={{ textAlign: 'right', color: 'var(--success-text)', fontWeight: 500 }}>{Number(h.prod).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      <td style={{ textAlign: 'right', color: 'var(--info-text)', fontWeight: 500 }}>{Number(h.enc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {h.anomalies && h.anomalies.length > 0 && (
                            <button onClick={() => setSelectedAnomalies(h.anomalies)} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger-text)' }}>
                              <ShieldAlert size={14} /> {h.anomalies.length} anomalie{h.anomalies.length > 1 ? 's' : ''}
                            </button>
                          )}
                          {h.import_id && (
                            <button onClick={() => deleteImport(h.import_id)} className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--text-muted)' }} title="Supprimer cet import">
                              <Trash2 size={16} />
                            </button>
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

        {/* Guide d'export — en bas, discret */}
        {(() => {
          const GUIDE_SECTIONS = [
            {
              id: 'doctolib',
              label: 'Étape 1 — Agenda Doctolib',
              badge: 'Obligatoire',
              badgeColor: 'var(--primary)',
              badgeBg: 'var(--primary-light)',
              intro: "Exportez l'historique des rendez-vous depuis votre espace pro Doctolib. Un accès administrateur est requis.",
              steps: [
                { text: <>Connectez-vous sur <strong>pro.doctolib.fr</strong></> },
                { text: <>Cliquez sur vos <strong>initiales / photo</strong> en haut à droite</> },
                { text: <>Allez dans <strong>Paramètres avancés → Données → Exports</strong></> },
                { text: <><strong>Type de données</strong> : sélectionnez <em>Historique de RDV</em></> },
                { text: <>Choisissez la <strong>période</strong> (ex : mois en cours ou année entière)</> },
                { text: <>Cliquez <strong>Exporter le fichier</strong>, saisissez votre mot de passe si demandé</> },
                { text: <>Attendez le statut <strong>« Prêt »</strong> puis cliquez sur le nom du fichier pour le télécharger</> },
              ],
              note: "Si l'option est grisée, vous n'avez pas les droits d'export. Contactez le support Doctolib en précisant votre statut de praticien administrateur.",
              link: { label: 'Ouvrir Doctolib Pro', url: 'https://pro.doctolib.fr' },
            },
            {
              id: 'logosw',
              label: 'Étape 2 — Comptabilité LogosW',
              badge: 'Obligatoire',
              badgeColor: 'var(--primary)',
              badgeBg: 'var(--primary-light)',
              intro: "Exportez le journal des actes et règlements depuis le module comptabilité de LogosW.",
              steps: [
                { text: <>Ouvrez <strong>LogosW</strong> sur votre poste de travail</> },
                { text: <>Dans le menu principal, cliquez sur <strong>Statistiques</strong> ou <strong>Comptabilité</strong></> },
                { text: <>Accédez à la section <strong>Exports</strong> ou <strong>Journal de caisse / Relevé d'actes</strong></> },
                { text: <>Sélectionnez la <strong>période</strong> souhaitée (mensuelle ou personnalisée)</> },
                { text: <>Choisissez le format de sortie : <strong>CSV</strong> ou <strong>Excel (.xlsx)</strong></> },
                { text: <>Cliquez sur <strong>Exporter</strong> et sauvegardez le fichier sur votre bureau</> },
              ],
              note: "Le fichier doit contenir les colonnes : date, montant_acte, reglement_somme, libelle, praticien. En cas de doute, contactez le support LogosW au 02 99 84 11 44.",
              link: { label: 'Site LogosW', url: 'https://www.logosw.net' },
            },
            {
              id: 'logosw_patients',
              label: 'Optionnel — Dictionnaire patients LogosW',
              badge: 'Recommandé',
              badgeColor: '#6d28d9',
              badgeBg: '#ede9fe',
              intro: "Ce fichier permet à l'outil de croiser automatiquement les dossiers Doctolib et LogosW. Très utile pour les patients anciens.",
              steps: [
                { text: <>Ouvrez <strong>LogosW</strong> sur votre poste</> },
                { text: <>Allez dans <strong>Fichiers → Patients</strong> ou <strong>Liste des dossiers patients</strong></> },
                { text: <>Utilisez la fonction <strong>Exporter / Imprimer vers fichier</strong></> },
                { text: <>Sélectionnez les champs : <strong>Nom, Prénom, Date de naissance, N° dossier</strong></> },
                { text: <>Exportez en <strong>CSV</strong> ou <strong>Excel</strong> et sauvegardez le fichier</> },
              ],
              note: "Sans ce fichier, le croisement se fait sur la similarité des noms. Avec ce fichier, le taux de matching approche 95–100%.",
              link: null,
            },
          ];
          return (
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', backgroundColor: 'var(--card)' }}>
              <div style={{ padding: '0.875rem 1.25rem', borderBottom: openGuideSection !== null ? '1px solid var(--border)' : 'none', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <BookOpen size={16} color="var(--text-muted)" />
                <span style={{ fontWeight: 600, fontSize: '0.875rem', flex: 1, color: 'var(--text-muted)' }}>Guide : comment récupérer les fichiers ?</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.7 }}>Cliquez sur une section</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {GUIDE_SECTIONS.map((section, idx) => {
                  const isOpen = openGuideSection === section.id;
                  return (
                    <div key={section.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                      <button
                        onClick={() => setOpenGuideSection(isOpen ? null : section.id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', backgroundColor: isOpen ? 'var(--primary-light)' : 'transparent', transition: 'background-color 0.15s' }}
                      >
                        {isOpen ? <ChevronDown size={15} color="var(--primary)" /> : <ChevronRight size={15} color="var(--text-muted)" />}
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1, color: isOpen ? 'var(--primary)' : 'var(--text)' }}>{section.label}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: section.badgeBg, color: section.badgeColor }}>{section.badge}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '1rem 1.5rem 1.25rem', backgroundColor: 'white', borderTop: '1px solid var(--border)' }}>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>{section.intro}</p>
                          <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {section.steps.map((step, i) => (
                              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6 }}>{step.text}</li>
                            ))}
                          </ol>
                          {section.note && (
                            <div style={{ marginTop: '1rem', padding: '0.6rem 0.85rem', backgroundColor: '#fef9c3', borderLeft: '3px solid #f59e0b', borderRadius: '0 0.375rem 0.375rem 0', fontSize: '0.78rem', color: '#78350f', lineHeight: 1.5 }}>
                              <strong>Note :</strong> {section.note}
                            </div>
                          )}
                          {section.link && (
                            <a href={section.link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                              <ExternalLink size={13} />{section.link.label}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {selectedAnomalies && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }} onClick={() => setSelectedAnomalies(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '1rem' }} onClick={e => e.stopPropagation()}>
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
