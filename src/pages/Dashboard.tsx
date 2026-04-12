import { useState, useEffect } from 'react';
import { Users, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';

const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#f43f5e'];

export function Dashboard() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });
  const [selectedPraticien, setSelectedPraticien] = useState<string | null>(null);
  const [praticienDetails, setPraticienDetails] = useState<any[]>([]);
  const [activeStatsTab, setActiveStatsTab] = useState('praticien');

  const [dbData, setDbData] = useState<{
    hasData: boolean;
    lastImport: string;
    totalPatients: number;
    patientsLabel: string;
    totalEncaissé: number;
    totalProduction: number;
    chartData: any[];
    praticiens: any[];
    dataPraticiensRevenus: any[];
    dataActesRevenus: any[];
  }>({
    hasData: false,
    lastImport: 'Aucun',
    totalPatients: 0,
    patientsLabel: 'Total Patients (Base)',
    totalEncaissé: 0,
    totalProduction: 0,
    chartData: [],
    praticiens: [],
    dataPraticiensRevenus: [],
    dataActesRevenus: []
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
          lastImportStr = new Date(String(logRes[0].values[0][0])).toLocaleDateString('fr-FR');
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
        
        const actRes = db.exec(`SELECT SUM(montant_acte), SUM(reglement_somme) FROM clinical_acts WHERE 1=1 ${whereDateAct}`, argsAct);
        let tProd = 0, tEnc = 0;
        if (actRes.length > 0 && actRes[0].values[0]) {
           tProd = Number(actRes[0].values[0][0]) || 0;
           tEnc = Number(actRes[0].values[0][1]) || 0;
        }

        const cDataRes = db.exec(`
          SELECT 
            substr(date, 1, 7) as mois, 
            SUM(reglement_somme) as enc, 
            SUM(montant_acte) as prod,
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
                patients: Number(v[3]) || 0
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
            "RMe": "Dr. RMe (Dr Réda Mechouk externe ?)",
            "RMr": "Dr. RMr (Dr Réda Mechouk remplaçant ?)"
          };
          dataPraticiensRevenus = pRRes[0].values.map(v => {
            let nameStr = String(v[0]);
            if (mapNames[nameStr]) nameStr = mapNames[nameStr];
            else if (nameStr && nameStr !== 'NC') nameStr = `Dr. ${nameStr.replace('Dr. ', '').replace('Docteur ', '')}`;
            else nameStr = 'Cabinet';
            
            return {
              name: nameStr,
              revenus: Number(v[1]) || 0
            };
          });
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

        setDbData({
          hasData: true,
          lastImport: lastImportStr,
          totalPatients: tPatients,
          patientsLabel: pLabel,
          totalEncaissé: tEnc,
          totalProduction: tProd,
          chartData: cData,
          praticiens: pData,
          dataPraticiensRevenus,
          dataActesRevenus
        });
      }
    } catch (e) {
      console.error("Dashboard error:", e);
    }
  }, [dateRange]);

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
           date: v[4] ? new Date(String(v[4])).toLocaleDateString('fr-FR') : 'Date NC',
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
              {entry.name} : {Number(entry.value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Vue d'ensemble</h1>
          <p style={{ color: 'var(--text-muted)' }}>Statistiques consolidées {dateRange.start ? 'sur la période sélectionnée' : 'de tout le cabinet'}.</p>
        </div>
        <DateRangePicker onRangeChange={(s, e) => setDateRange({ start: s, end: e })} />
      </div>
      
      {!dbData.hasData && (
        <div className="card" style={{ backgroundColor: 'var(--info-bg)', border: '1px solid var(--info)', display: 'flex', gap: '1rem', alignItems: 'center', animation: 'fadeIn 0.5s ease-out' }}>
          <div style={{ color: 'var(--info-text)' }}><AlertTriangle size={24} /></div>
          <div>
            <h4 style={{ fontWeight: 600, color: 'var(--info-text)', fontSize: '0.875rem' }}>Prêt pour l'import initial</h4>
            <p style={{ color: 'var(--info-text)', fontSize: '0.875rem', opacity: 0.9 }}>Chargez vos fichiers Doctolib et LogosW pour voir vos statistiques réelles s'afficher ici.</p>
          </div>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => navigate('/imports')}>Démarrer l'import</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {[
          { label: dbData.patientsLabel, value: dbData.totalPatients.toLocaleString('fr-FR'), icon: Users, color: "var(--primary)", bg: "var(--primary-light)", path: "/patients" },
          { label: "Encaissement global", value: dbData.totalEncaissé.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), icon: CheckCircle, color: "var(--success-text)", bg: "var(--success-bg)", path: "/revenues" },
          { label: "Production globale", value: dbData.totalProduction.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), icon: Clock, color: "var(--warning-text)", bg: "var(--warning-bg)", path: "/revenues" },
          { label: "Dernier import", value: dbData.lastImport, icon: AlertTriangle, color: "var(--info-text)", bg: "var(--info-bg)", path: "/imports" },
        ].map((kpi, index) => (
          <div 
            key={index} 
            className="card" 
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: kpi.path ? 'pointer' : 'default', opacity: dbData.hasData ? 1 : 0.5 }}
            onClick={() => kpi.path && navigate(kpi.path)}
          >
            <div style={{ padding: '1rem', backgroundColor: kpi.bg, borderRadius: '0.5rem', color: kpi.color }}>
              <kpi.icon size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{kpi.label}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '1.3rem', fontWeight: 600 }}>{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', opacity: dbData.hasData ? 1 : 0.5 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Production vs Encaissement</h3>
          <div style={{ height: '300px', width: '100%' }}>
             {dbData.hasData && dbData.chartData.length > 0 && dbData.chartData[0].name !== 'Lun' ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={dbData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(val) => `${val}€`} />
                   <Tooltip cursor={{ fill: 'var(--bg)' }} content={<CustomTooltip />} />
                   <Legend iconType="circle" />
                   <Bar dataKey="production" name="Production" fill="var(--warning-text)" radius={[4, 4, 0, 0]} />
                   <Bar dataKey="encaissement" name="Encaissement" fill="var(--success-text)" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
                <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '100px' }}>Graphique en attente de données réelles (sélectionnez une période plus large)</p>
             )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', opacity: dbData.hasData ? 1 : 0.5 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.25rem' }}>Activité Praticiens (Rendez-vous)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
             {dbData.hasData && dbData.praticiens.length > 0 ? dbData.praticiens.map((p, i) => (
              <div 
                key={i} 
                style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.5rem', transition: 'background-color 0.2s', backgroundColor: 'var(--bg)' }}
                onClick={() => setSelectedPraticien(p.name)}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-light)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--bg)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}><strong>{p.patients}</strong> RDV actés</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--card)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (p.patients / (dbData.totalPatients||1)) * 100 * 3)}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                </div>
              </div>
            )) : (
               <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Aucune activité sur la période.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, opacity: dbData.hasData ? 1 : 0.5 }}>
        <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '2rem' }}>
          {[
            { id: 'praticien', label: 'Honoraires par praticien' },
            { id: 'acte', label: 'Honoraires par type d\'acte' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveStatsTab(tab.id)}
              style={{
                padding: '1.25rem 0',
                borderBottom: `2px solid ${activeStatsTab === tab.id ? 'var(--primary)' : 'transparent'}`,
                color: activeStatsTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: activeStatsTab === tab.id ? 500 : 400,
                transition: 'all 0.2s ease',
              }}
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '2rem' }}>
          <div style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', backgroundColor: 'var(--card)', boxShadow: 'var(--shadow-lg)', borderRadius: '1rem', display: 'flex', flexDirection: 'column' }}>
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
