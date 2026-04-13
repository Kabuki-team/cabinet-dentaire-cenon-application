import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, Clock, AlertTriangle, X, TrendingDown, TrendingUp } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, PieChart, Pie, Cell, Line, BarChart } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';
import { formatToFrench } from '../lib/dateUtils';

const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#f43f5e'];

export function Dashboard() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });
  const [selectedPraticien, setSelectedPraticien] = useState<string | null>(null);
  const [praticienDetails, setPraticienDetails] = useState<any[]>([]);
  const [activeStatsTab, setActiveStatsTab] = useState('praticien');
  const [alerts, setAlerts] = useState<{ type: 'danger' | 'warning' | 'info'; msg: string; id: number }[]>([]);

  const [dbData, setDbData] = useState<{
    hasData: boolean;
    lastImport: string;
    totalPatients: number;
    patientsLabel: string;
    totalEncaissé: number;
    totalProduction: number;
    tauxEnc: number;
    creancesEnCours: number;
    chartData: any[];
    praticiens: any[];
    dataPraticiensRevenus: any[];
    dataActesRevenus: any[];
    prevProd: number;
    prevEnc: number;
    prevTauxEnc: number;
    prevCreances: number;
    compLabel: string;
  }>({
    hasData: false,
    lastImport: 'Aucun',
    totalPatients: 0,
    patientsLabel: 'Total Patients (Base)',
    totalEncaissé: 0,
    totalProduction: 0,
    tauxEnc: 0,
    creancesEnCours: 0,
    chartData: [],
    praticiens: [],
    dataPraticiensRevenus: [],
    dataActesRevenus: [],
    prevProd: 0,
    prevEnc: 0,
    prevTauxEnc: 0,
    prevCreances: 0,
    compLabel: 'vs période précédente',
  });

  useEffect(() => {
    const db = getDB();
    if (!db) return;

    try {
      let whereDateAct = "";
      let whereDateAppt = "";
      const argsAct: string[] = [];
      const argsAppt: string[] = [];
      
      if (dateRange.start && dateRange.end) {
         const tzOffsetStart = dateRange.start.getTimezoneOffset() * 60000;
         const tzOffsetEnd = dateRange.end.getTimezoneOffset() * 60000;
         const sd = new Date(dateRange.start.getTime() - tzOffsetStart).toISOString().split('T')[0];
         const ed = new Date(dateRange.end.getTime() - tzOffsetEnd).toISOString().split('T')[0];
         
         whereDateAct = " AND date >= ? AND date <= ?";
         whereDateAppt = " AND date >= ? AND date <= ?";
         argsAct.push(sd, ed);
         argsAppt.push(sd, ed);
      }

      const globalCountRes = db.exec("SELECT COUNT(*) FROM patients");
      if (globalCountRes.length > 0 && globalCountRes[0].values[0] && Number(globalCountRes[0].values[0][0]) > 0) {
        
        let lastImportStr = 'Récent';
        const logRes = db.exec("SELECT timestamp FROM import_logs ORDER BY timestamp DESC LIMIT 1");
        if (logRes.length > 0 && logRes[0].values[0][0]) {
          lastImportStr = formatToFrench(String(logRes[0].values[0][0]));
        }

        let tPatients = 0;
        let pLabel = "Total Patients (Base)";
        if (dateRange.start && dateRange.end) {
           const patRes = db.exec(`SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE statut = 'Vu' ${whereDateAppt}`, argsAppt);
           tPatients = (patRes.length > 0 && patRes[0].values[0]) ? Number(patRes[0].values[0][0]) : 0;
           pLabel = "Patients consultés";
        } else {
           tPatients = Number(globalCountRes[0].values[0][0]);
        }
        
        const actRes = db.exec(`SELECT SUM(montant_acte), SUM(COALESCE(reglement_somme, 0)) FROM clinical_acts WHERE montant_acte > 0 ${whereDateAct}`, argsAct);
        let tProd = 0, tEnc = 0;
        if (actRes.length > 0 && actRes[0].values[0]) {
           tProd = Number(actRes[0].values[0][0]) || 0;
           tEnc = Number(actRes[0].values[0][1]) || 0;
        }
        const tauxEncGlobal = tProd > 0 ? Math.round(tEnc * 100 / tProd) : 0;
        const creancesEnCours = Math.max(0, tProd - tEnc);

        const cDataRes = db.exec(`
          SELECT
            substr(date, 1, 7) as mois,
            SUM(COALESCE(reglement_somme, 0)) as enc,
            SUM(montant_acte) as prod,
            ROUND(SUM(COALESCE(reglement_somme, 0)) * 100.0 / NULLIF(SUM(montant_acte), 0), 1) as tauxEnc,
            (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE substr(date, 1, 7) = substr(clinical_acts.date, 1, 7) AND statut = 'Vu' ${whereDateAppt}) as pat
          FROM clinical_acts
          WHERE date IS NOT NULL AND date != '' ${whereDateAct}
          GROUP BY mois ORDER BY mois ASC LIMIT 12
        `, [...argsAppt, ...argsAct]);

        let cData: any[] = [];
        if (cDataRes.length > 0) {
           cData = cDataRes[0].values.map(v => {
              const [y, m] = String(v[0]).split('-');
              const mName = monthNames[parseInt(m) - 1] || m;
              return {
                name: `${mName} ${y}`,
                encaissement: Number(v[1]) || 0,
                production: Number(v[2]) || 0,
                tauxEnc: Number(v[3]) || 0,
                patients: Number(v[4]) || 0
              };
           });
        } else {
           cData = [
             { name: 'Lun', encaissement: 0, production: 0, patients: 0 },
             { name: 'Mar', encaissement: 0, production: 0, patients: 0 },
             { name: 'Mer', encaissement: 0, production: 0, patients: 0 },
           ];
        }

        const pDataRes = db.exec(`
          SELECT praticien, COUNT(id) as nb 
          FROM appointments 
          WHERE praticien != '' AND praticien IS NOT NULL AND statut = 'Vu' ${whereDateAppt}
          GROUP BY praticien 
          ORDER BY nb DESC 
          LIMIT 5
        `, argsAppt);
        
        let pData: any[] = [];
        if (pDataRes.length > 0) {
          pData = pDataRes[0].values.map(v => ({
             name: String(v[0]),
             patients: Number(v[1]) || 0
          }));
        }

        const pRRes = db.exec(`
          SELECT 
            CASE WHEN c.logosw_praticien IS NOT NULL AND c.logosw_praticien != 'NC' THEN c.logosw_praticien ELSE (SELECT praticien FROM appointments a WHERE a.patient_id = c.patient_id AND a.date = c.date LIMIT 1) END as praticien,
            SUM(c.montant_acte) as prod
          FROM clinical_acts c
          WHERE c.montant_acte > 0 ${whereDateAct}
          GROUP BY praticien
          ORDER BY prod DESC
        `, argsAct);

        let dataPraticiensRevenus: any[] = [];
        if (pRRes.length > 0) {
          const mapNames: Record<string, string> = { 
            "RM": "Dr. Réda Mechouk",
            "MF": "Dr. Medy Fakreldin",
            "HG": "Dr. Hamza Gafsi",
            "JL": "Dr. Jean Laborde Barbanegre",
            "MFr": "Dr. Benoit Say-Liang-Fat",
            "RMr": "Dr. Benoit Say-Liang-Fat",
            "RMe": "Etudiant non Thèsé",
            "MFe": "Etudiant non Thèsé"
          };
          
          const agg: Record<string, number> = {};
          pRRes[0].values.forEach(v => {
            let nameStr = String(v[0]);
            if (mapNames[nameStr]) nameStr = mapNames[nameStr];
            else if (nameStr && nameStr !== 'NC') nameStr = `Dr. ${nameStr.replace('Dr. ', '').replace('Docteur ', '')}`;
            else nameStr = 'Cabinet';
            
            agg[nameStr] = (agg[nameStr] || 0) + (Number(v[1]) || 0);
          });

          dataPraticiensRevenus = Object.entries(agg).map(([name, revenus]) => ({
            name,
            revenus
          })).sort((a: any, b: any) => b.revenus - a.revenus);
        }

        const aRRes = db.exec(`
          SELECT c.libelle, SUM(c.montant_acte) as total
          FROM clinical_acts c
          WHERE c.type = 'ACTE' AND c.montant_acte > 0 ${whereDateAct}
          GROUP BY c.libelle
          ORDER BY total DESC
          LIMIT 5
        `, argsAct);
        
        let dataActesRevenus: any[] = [];
        if (aRRes.length > 0) {
          dataActesRevenus = aRRes[0].values.map((v, i) => ({
            name: typeof v[0] === 'string' ? (v[0].length > 30 ? v[0].substring(0, 30) + '...' : v[0]) : 'Acte', 
            value: Number(v[1]) || 0,
            color: COLORS[i % COLORS.length]
          }));
        }

        // ── Période précédente ──
        let prevProd = 0, prevEnc = 0, prevTauxEnc = 0, prevCreances = 0;
        let compLabel = 'vs période précédente';

        if (dateRange.start && dateRange.end) {
          // Même durée, 1 an avant
          const tzO = dateRange.start.getTimezoneOffset() * 60000;
          const dur = dateRange.end.getTime() - dateRange.start.getTime();
          const pStart = new Date(dateRange.start.getTime() - tzO - 365 * 86400000).toISOString().split('T')[0];
          const pEnd   = new Date(dateRange.start.getTime() - tzO - 365 * 86400000 + dur).toISOString().split('T')[0];
          compLabel = 'vs même période N-1';
          const prevRes = db.exec(
            `SELECT SUM(montant_acte), SUM(COALESCE(reglement_somme,0)) FROM clinical_acts WHERE montant_acte > 0 AND date >= ? AND date <= ?`,
            [pStart, pEnd]
          );
          if (prevRes.length > 0 && prevRes[0].values[0]) {
            prevProd = Number(prevRes[0].values[0][0]) || 0;
            prevEnc  = Number(prevRes[0].values[0][1]) || 0;
            prevTauxEnc = prevProd > 0 ? Math.round(prevEnc * 100 / prevProd) : 0;
            prevCreances = Math.max(0, prevProd - prevEnc);
          }
        } else {
          // Dernier mois complet vs mois d'avant
          const prevRes = db.exec(`
            SELECT
              SUM(CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-1 month')) THEN montant_acte ELSE 0 END),
              SUM(CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-1 month')) THEN COALESCE(reglement_somme,0) ELSE 0 END),
              SUM(CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-2 months')) THEN montant_acte ELSE 0 END),
              SUM(CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-2 months')) THEN COALESCE(reglement_somme,0) ELSE 0 END)
            FROM clinical_acts WHERE montant_acte > 0
          `);
          if (prevRes.length > 0 && prevRes[0].values[0]) {
            const curMonthProd = Number(prevRes[0].values[0][0]) || 0;
            const curMonthEnc  = Number(prevRes[0].values[0][1]) || 0;
            prevProd = Number(prevRes[0].values[0][2]) || 0;
            prevEnc  = Number(prevRes[0].values[0][3]) || 0;
            prevTauxEnc = prevProd > 0 ? Math.round(prevEnc * 100 / prevProd) : 0;
            prevCreances = Math.max(0, prevProd - prevEnc);
            // Override current stats to last month for comparison context
            if (curMonthProd > 0) {
              compLabel = 'vs mois précédent';
            }
          }
        }

        setDbData({
          hasData: true,
          lastImport: lastImportStr,
          totalPatients: tPatients,
          patientsLabel: pLabel,
          totalEncaissé: tEnc,
          totalProduction: tProd,
          tauxEnc: tauxEncGlobal,
          creancesEnCours,
          chartData: cData,
          praticiens: pData,
          dataPraticiensRevenus,
          dataActesRevenus,
          prevProd,
          prevEnc,
          prevTauxEnc,
          prevCreances,
          compLabel,
        });
      }
    } catch (e) {
      console.error("Dashboard error:", e);
    }
  }, [dateRange]);

  // Compute global alerts once on mount
  useEffect(() => {
    const db = getDB();
    if (!db) return;
    try {
      const newAlerts: { type: 'danger' | 'warning' | 'info'; msg: string; id: number }[] = [];

      const encRes = db.exec("SELECT SUM(montant_acte), SUM(COALESCE(reglement_somme, 0)) FROM clinical_acts WHERE montant_acte > 0");
      if (encRes.length > 0 && encRes[0].values[0]) {
        const prod = Number(encRes[0].values[0][0]) || 0;
        const enc = Number(encRes[0].values[0][1]) || 0;
        const taux = prod > 0 ? Math.round(enc * 100 / prod) : 0;
        if (prod > 0 && taux < 70) newAlerts.push({ type: 'danger', msg: `Taux d'encaissement critique : ${taux}% — vérifiez les règlements en attente`, id: 1 });
        else if (prod > 0 && taux < 85) newAlerts.push({ type: 'warning', msg: `Taux d'encaissement en dessous de l'objectif (85%) : ${taux}%`, id: 2 });
      }

      const anomRes = db.exec(`SELECT COUNT(*) FROM appointments a LEFT JOIN clinical_acts ca ON a.patient_id = ca.patient_id AND a.date = ca.date WHERE a.statut = 'Vu' AND ca.id IS NULL`);
      if (anomRes.length > 0 && anomRes[0].values[0]) {
        const nb = Number(anomRes[0].values[0][0]) || 0;
        if (nb > 10) newAlerts.push({ type: 'warning', msg: `${nb} rendez-vous sans acte associé détectés`, id: 3 });
      }

      const logRes = db.exec("SELECT MAX(timestamp) FROM import_logs");
      if (logRes.length > 0 && logRes[0].values[0][0]) {
        const diffDays = Math.floor((Date.now() - new Date(String(logRes[0].values[0][0])).getTime()) / 86400000);
        if (diffDays > 14) newAlerts.push({ type: 'info', msg: `Données non mises à jour depuis ${diffDays} jour${diffDays > 1 ? 's' : ''}`, id: 4 });
      }

      setAlerts(newAlerts);
    } catch (e) { console.error(e); }
  }, []);

  // Fetch practitioner details when selected
  useEffect(() => {
    const db = getDB();
    if (!db || !selectedPraticien) return;

    try {
      let whereDateAppt = "";
      let whereDateAct = "";
      // We need arguments for the main query and the subqueries.
      const argsProdEnc: string[] = [];
      const argsAppt: string[] = [selectedPraticien];
      
      if (dateRange.start && dateRange.end) {
         const tzOffsetStart = dateRange.start.getTimezoneOffset() * 60000;
         const tzOffsetEnd = dateRange.end.getTimezoneOffset() * 60000;
         const sd = new Date(dateRange.start.getTime() - tzOffsetStart).toISOString().split('T')[0];
         const ed = new Date(dateRange.end.getTime() - tzOffsetEnd).toISOString().split('T')[0];
         
         whereDateAppt = " AND a.date >= ? AND a.date <= ?";
         whereDateAct = " AND c.date >= ? AND c.date <= ?";
         
         argsAppt.push(sd, ed);
         argsProdEnc.push(sd, ed);
      }

      // Group by patient to get their total production and encaissement over the period
      const q = `
        SELECT 
          p.id, 
          p.nom, 
          p.prenom,
          COUNT(a.id) as nb_consult,
          MAX(a.date) as last_date,
          (SELECT SUM(montant_acte) FROM clinical_acts c WHERE c.patient_id = p.id ${whereDateAct}) as prod,
          (SELECT SUM(reglement_somme) FROM clinical_acts c WHERE c.patient_id = p.id ${whereDateAct}) as enc
        FROM patients p
        JOIN appointments a ON a.patient_id = p.id
        WHERE a.praticien = ? AND a.statut = 'Vu' ${whereDateAppt}
        GROUP BY p.id
        ORDER BY prod DESC, last_date DESC
        LIMIT 50
      `;

      // The execution requires the parameters in the correct order:
      // Subquery 1 (prod): argsProdEnc
      // Subquery 2 (enc): argsProdEnc
      // Main Query (praticien & whereDateAppt): argsAppt
      const finalArgs = [...argsProdEnc, ...argsProdEnc, ...argsAppt];

      const res = db.exec(q, finalArgs);
      if (res.length > 0) {
         setPraticienDetails(res[0].values.map(v => ({
            patientId: v[0],
            patientName: `${v[2] || ''} ${v[1] || ''}`.trim(),
            nbConsult: Number(v[3]) || 0,
            date: v[4] ? formatToFrench(String(v[4])) : 'Date NC',
            prod: Number(v[5]) || 0,
            enc: Number(v[6]) || 0
         })));
      } else {
        setPraticienDetails([]);
      }

    } catch(e) {
      console.error(e);
      setPraticienDetails([]);
    }
  }, [selectedPraticien, dateRange]);


  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ padding: '0.75rem', backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color, fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
              {entry.name} : {entry.dataKey === 'tauxEnc' ? `${entry.value}%` : Number(entry.value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </p>
          ))}
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Patients vus : <span style={{ fontWeight: 600, color: 'var(--text)' }}>{payload[0].payload.patients}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const pctDelta = (cur: number, prev: number) =>
    prev > 0 ? Math.round((cur - prev) / prev * 100) : null;

  const DeltaBadge = ({ cur, prev, invertColor = false }: { cur: number; prev: number; invertColor?: boolean }) => {
    const d = pctDelta(cur, prev);
    if (d === null || prev === 0) return null;
    const positive = invertColor ? d < 0 : d > 0;
    const color = positive ? 'var(--green-text)' : 'var(--red-text)';
    return (
      <div style={{ fontSize: '0.72rem', fontWeight: 500, color, marginBottom: '0.2rem', letterSpacing: '0.01em' }}>
        {d > 0 ? '▲' : '▼'} {Math.abs(d)}% <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{dbData.compLabel}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }} className="animate-in">
      {/* Barre d'actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <DateRangePicker onRangeChange={(s, e) => setDateRange({ start: s, end: e })} />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {alerts.map(alert => (
            <div key={alert.id} className={`alert alert--${alert.type}`}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <p style={{ flex: 1, margin: 0 }}>{alert.msg}</p>
              <button
                onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem', opacity: 0.6 }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!dbData.hasData && (
        <div className="alert alert--info" style={{ borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Prêt pour l'import initial</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>Chargez vos fichiers Doctolib et LogosW pour voir vos statistiques réelles.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/imports')}>
            Démarrer l'import
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid stagger">
        {/* Patients */}
        <div className={`kpi-card animate-in${!dbData.hasData ? ' kpi-card--dimmed' : ''}`} onClick={() => navigate('/patients')}>
          <span className="kpi-label">{dbData.patientsLabel}</span>
          <div className="kpi-value">{dbData.totalPatients.toLocaleString('fr-FR')}</div>
          <div className="kpi-hint">
            {dateRange.start ? 'Patients ayant eu au moins un RDV honoré sur la période.' : 'Total patients enregistrés dans la base (Doctolib + LogosW).'}
          </div>
        </div>

        {/* Production */}
        <div className={`kpi-card animate-in${!dbData.hasData ? ' kpi-card--dimmed' : ''}`} onClick={() => navigate('/revenues')}>
          <span className="kpi-label">Honoraires produits</span>
          <div className="kpi-value">{dbData.totalProduction.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
          <DeltaBadge cur={dbData.totalProduction} prev={dbData.prevProd} />
          <div className="kpi-hint">Total des actes facturés (montant brut avant paiement). Source : LogosW.</div>
        </div>

        {/* Encaissement */}
        <div className={`kpi-card animate-in${!dbData.hasData ? ' kpi-card--dimmed' : ''}`} onClick={() => navigate('/revenues')}>
          <span className="kpi-label">Encaissement réel</span>
          <div className="kpi-value" style={{ color: 'var(--green-text)' }}>
            {dbData.totalEncaissé.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </div>
          <DeltaBadge cur={dbData.totalEncaissé} prev={dbData.prevEnc} />
          <div className="kpi-hint">Somme des règlements effectivement reçus (CB, espèces, virement…).</div>
        </div>

        {/* Taux d'encaissement */}
        <div className={`kpi-card animate-in${!dbData.hasData ? ' kpi-card--dimmed' : ''}`} onClick={() => navigate('/revenues')}>
          <span className="kpi-label">Taux d'encaissement</span>
          <div className="kpi-value" style={{
            color: dbData.tauxEnc >= 85 ? 'var(--green-text)' : dbData.tauxEnc >= 70 ? 'var(--orange-text)' : 'var(--red-text)',
          }}>
            {dbData.tauxEnc}%
          </div>
          <DeltaBadge cur={dbData.tauxEnc} prev={dbData.prevTauxEnc} />
          <div className="kpi-hint">
            {dbData.tauxEnc >= 85
              ? 'Excellent — objectif cabinet atteint (≥ 85%).'
              : dbData.tauxEnc >= 70
              ? 'En dessous de l\'objectif (85%) — vérifiez les impayés.'
              : 'Critique — taux faible, action de recouvrement urgente.'}
          </div>
        </div>

        {/* Créances */}
        <div className={`kpi-card animate-in${!dbData.hasData ? ' kpi-card--dimmed' : ''}`} onClick={() => navigate('/recouvrement')}>
          <span className="kpi-label">Créances en cours</span>
          <div className="kpi-value" style={{ color: dbData.creancesEnCours > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {dbData.creancesEnCours.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </div>
          <DeltaBadge cur={dbData.creancesEnCours} prev={dbData.prevCreances} invertColor />
          <div className="kpi-hint">
            Différence entre production et encaissement — montants non encore réglés par les patients.
          </div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', opacity: dbData.hasData ? 1 : 0.5 }}>
          <div style={{ marginBottom: '1rem' }}>
            <h3 className="section-title">Production vs Encaissement</h3>
            <p className="section-subtitle">Chaque barre représente un mois. La ligne violette indique le taux d'encaissement (échelle droite, en %).</p>
          </div>
          <div style={{ height: '300px', width: '100%' }}>
             {dbData.hasData && dbData.chartData.length > 0 && dbData.chartData[0].name !== 'Lun' ? (
               <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={dbData.chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                   <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(val) => `${val}€`} />
                   <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b5cf6' }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                   <Tooltip cursor={{ fill: 'var(--bg)' }} content={<CustomTooltip />} />
                   <Legend iconType="circle" />
                   <Bar yAxisId="left" dataKey="production" name="Production" fill="var(--warning-text)" radius={[4, 4, 0, 0]} />
                   <Bar yAxisId="left" dataKey="encaissement" name="Encaissement" fill="var(--success-text)" radius={[4, 4, 0, 0]} />
                   <Line yAxisId="right" type="monotone" dataKey="tauxEnc" name="Taux enc. %" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                 </ComposedChart>
               </ResponsiveContainer>
             ) : (
                <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '100px' }}>Graphique en attente de données réelles (sélectionnez une période plus large)</p>
             )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', opacity: dbData.hasData ? 1 : 0.5 }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 className="section-title">Activité Praticiens</h3>
            <p className="section-subtitle">RDV honorés par praticien. Cliquez pour voir le détail.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
             {dbData.hasData && dbData.praticiens.length > 0 ? dbData.praticiens.map((p, i) => {
               const maxPat = Math.max(...dbData.praticiens.map((x: any) => x.patients));
               const pct = maxPat > 0 ? Math.round((p.patients / maxPat) * 100) : 0;
               return (
                 <div
                   key={i}
                   style={{ cursor: 'pointer', padding: '0.75rem', borderRadius: 'var(--radius)', background: 'var(--bg)', border: '1px solid transparent', transition: 'all 0.15s' }}
                   onClick={() => setSelectedPraticien(p.name)}
                   onMouseOver={(e) => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.borderColor = 'var(--primary-mid)'; }}
                   onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'transparent'; }}
                 >
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                     <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                     <span className="badge badge-neutral">{p.patients} RDV</span>
                   </div>
                   <div className="progress-track">
                     <div className="progress-fill" style={{ width: `${pct}%` }} />
                   </div>
                 </div>
               );
             }) : (
               <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Aucune activité sur la période.</p>
             )}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, opacity: dbData.hasData ? 1 : 0.5 }}>
        <div className="tabs-bar">
          {[
            { id: 'praticien', label: 'Honoraires par praticien' },
            { id: 'acte', label: 'Honoraires par type d\'acte' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn${activeStatsTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveStatsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '2rem 1.5rem' }}>
          {activeStatsTab === 'praticien' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem', alignItems: 'start' }}>
              <div style={{ height: '350px', width: '100%' }}>
                {dbData.dataPraticiensRevenus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dbData.dataPraticiensRevenus} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${v.toLocaleString()} €`} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text)', fontWeight: 600 }} width={120} />
                      <Tooltip formatter={(value: any) => Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} cursor={{fill: 'var(--bg)'}} />
                      <Bar dataKey="revenus" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Aucune donnée liée aux praticiens.</div>
                )}
              </div>
              <div style={{ textAlign: 'left', padding: '1rem 2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Top Praticiens (Honoraires)</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   {dbData.dataPraticiensRevenus.map((p, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                         <span style={{ fontWeight: 500 }}>{p.name}</span>
                         <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{p.revenus.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                      </li>
                   ))}
                </ul>
              </div>
            </div>
          )}

          {activeStatsTab === 'acte' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem', alignItems: 'center' }}>
              <div style={{ height: '350px', width: '100%' }}>
                {dbData.dataActesRevenus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={dbData.dataActesRevenus} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                        {dbData.dataActesRevenus.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Aucune donnée de facturation.</div>
                )}
              </div>
              <div style={{ textAlign: 'left', padding: '1rem 2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Actes les plus générateurs (Top 5)</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   {dbData.dataActesRevenus.map((a, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderLeft: `6px solid ${a.color}`, backgroundColor: 'var(--bg)', borderRadius: '0 0.5rem 0.5rem 0', boxShadow: 'var(--shadow-sm)' }}>
                         <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{a.name}</span>
                         <span style={{ fontWeight: 600, color: 'var(--text)' }}>{a.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                      </li>
                   ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedPraticien && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '2rem' }} onClick={() => setSelectedPraticien(null)}>
          <div style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', backgroundColor: 'var(--card)', boxShadow: 'var(--shadow-lg)', borderRadius: '1rem', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Détails d'activité : {selectedPraticien}</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>Consultations et règlements associés à ce praticien</p>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelectedPraticien(null)} style={{ padding: '0.5rem' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem', backgroundColor: 'var(--bg)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '0.5rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Dernière consult.</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Patient</th>
                    <th style={{ textAlign: 'right', padding: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--warning-text)' }}>Production (Période)</th>
                    <th style={{ textAlign: 'right', padding: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--success-text)' }}>Règlement (Période)</th>
                  </tr>
                </thead>
                <tbody>
                  {praticienDetails.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Aucune consultation correspondante trouvée.</td></tr>
                  ) : praticienDetails.map((det, i) => (
                    <tr key={i} style={{ borderBottom: i === praticienDetails.length - 1 ? 'none' : '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.2s' }} onClick={() => navigate(`/patients/${det.patientId}`)} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-light)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>{det.date}</td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {det.patientName} 
                        {det.nbConsult > 1 && <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>{det.nbConsult} RDV</span>}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: 500 }}>{det.prod > 0 ? det.prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '-'}</td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: 600, color: 'var(--success-text)' }}>{det.enc > 0 ? det.enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
