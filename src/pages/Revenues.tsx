import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell, Tooltip, ComposedChart, Line } from 'recharts';
import { Download } from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';
import { exportCSV } from '../lib/exportCsv';

const COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#f43f5e'];

export function Revenues() {
  const [activeTab, setActiveTab] = useState<'praticien' | 'acte' | 'evolution'>('praticien');
  const [dateRange, setDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });

  const [stats, setStats] = useState({ prod: 0, enc: 0, avgBasket: 0, patients: 0 });
  const [prevStats, setPrevStats] = useState({ prod: 0, enc: 0, avgBasket: 0, compLabel: 'vs période précédente' });
  const [objectifMensuel, setObjectifMensuel] = useState<number>(() => {
    const v = localStorage.getItem('objectif_mensuel');
    return v ? Number(v) : 0;
  });
  const [editingObjectif, setEditingObjectif] = useState(false);
  const [objectifInput, setObjectifInput] = useState('');
  const [dataPraticiens, setDataPraticiens] = useState<any[]>([]);
  const [dataActes, setDataActes] = useState<any[]>([]);
  const [dataEvolution, setDataEvolution] = useState<any[]>([]);

  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  useEffect(() => {
    const db = getDB();
    if (!db) return;

    try {
      let whereDateAct = "";
      const args: string[] = [];

      if (dateRange.start && dateRange.end) {
         const tzOffsetStart = dateRange.start.getTimezoneOffset() * 60000;
         const tzOffsetEnd = dateRange.end.getTimezoneOffset() * 60000;
         const sd = new Date(dateRange.start.getTime() - tzOffsetStart).toISOString().split('T')[0];
         const ed = new Date(dateRange.end.getTime() - tzOffsetEnd).toISOString().split('T')[0];
         
         whereDateAct = " AND c.date >= ? AND c.date <= ?";
         args.push(sd, ed);
      }

      // Globals
      const gRes = db.exec(`
        SELECT 
          SUM(c.montant_acte) as prod, 
          SUM(c.reglement_somme) as enc,
          COUNT(DISTINCT c.patient_id) as patients
        FROM clinical_acts c
        WHERE 1=1 ${whereDateAct}
      `, args);

      let prod = 0, enc = 0, patients = 0;
      if (gRes.length > 0 && gRes[0].values[0]) {
        prod = Number(gRes[0].values[0][0]) || 0;
        enc = Number(gRes[0].values[0][1]) || 0;
        patients = Number(gRes[0].values[0][2]) || 0;
      }
      setStats({ prod, enc, avgBasket: patients > 0 ? prod / patients : 0, patients });

      // ── Période précédente ──
      let prevProd = 0, prevEnc = 0, prevPatients = 0;
      let compLabel = 'vs période précédente';

      if (dateRange.start && dateRange.end) {
        const tzO = dateRange.start.getTimezoneOffset() * 60000;
        const dur = dateRange.end.getTime() - dateRange.start.getTime();
        const pStart = new Date(dateRange.start.getTime() - tzO - 365 * 86400000).toISOString().split('T')[0];
        const pEnd   = new Date(dateRange.start.getTime() - tzO - 365 * 86400000 + dur).toISOString().split('T')[0];
        compLabel = 'vs même période N-1';
        const prevRes = db.exec(
          `SELECT SUM(montant_acte), SUM(COALESCE(reglement_somme,0)), COUNT(DISTINCT patient_id) FROM clinical_acts WHERE montant_acte > 0 AND date >= ? AND date <= ?`,
          [pStart, pEnd]
        );
        if (prevRes.length > 0 && prevRes[0].values[0]) {
          prevProd     = Number(prevRes[0].values[0][0]) || 0;
          prevEnc      = Number(prevRes[0].values[0][1]) || 0;
          prevPatients = Number(prevRes[0].values[0][2]) || 0;
        }
      } else {
        compLabel = 'vs mois précédent';
        const prevRes = db.exec(`
          SELECT
            SUM(CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-2 months')) THEN montant_acte ELSE 0 END),
            SUM(CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-2 months')) THEN COALESCE(reglement_somme,0) ELSE 0 END),
            COUNT(DISTINCT CASE WHEN substr(date,1,7) = strftime('%Y-%m', date('now','-2 months')) THEN patient_id END)
          FROM clinical_acts WHERE montant_acte > 0
        `);
        if (prevRes.length > 0 && prevRes[0].values[0]) {
          prevProd     = Number(prevRes[0].values[0][0]) || 0;
          prevEnc      = Number(prevRes[0].values[0][1]) || 0;
          prevPatients = Number(prevRes[0].values[0][2]) || 0;
        }
      }
      setPrevStats({
        prod: prevProd,
        enc: prevEnc,
        avgBasket: prevPatients > 0 ? prevProd / prevPatients : 0,
        compLabel,
      });

      // Praticiens
      // To get production per practitioner, group acts by practitioner. We join appointments on patient_id and date.
      // If multiple appointments exist on the same day for a patient, this might duplicate the act if we just JOIN, 
      // but usually the daily production per practitioner is what's needed. We use a subquery to avoid duplication.
      const pRes = db.exec(`
        SELECT
          CASE WHEN c.logosw_praticien IS NOT NULL AND c.logosw_praticien != 'NC' THEN c.logosw_praticien ELSE (SELECT praticien FROM appointments a WHERE a.patient_id = c.patient_id AND a.date = c.date LIMIT 1) END as praticien,
          SUM(c.montant_acte) as prod,
          SUM(COALESCE(c.reglement_somme, 0)) as enc,
          COUNT(DISTINCT c.patient_id) as nb_patients
        FROM clinical_acts c
        WHERE c.montant_acte > 0 ${whereDateAct}
        GROUP BY praticien
        ORDER BY prod DESC
      `, args);

      if (pRes.length > 0) {
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
        const agg: Record<string, { revenus: number; enc: number; patients: number }> = {};
        pRes[0].values.forEach(v => {
          let nameStr = String(v[0]);
          if (mapNames[nameStr]) nameStr = mapNames[nameStr];
          else if (nameStr && nameStr !== 'NC' && nameStr !== 'null') nameStr = `Dr. ${nameStr.replace('Dr. ', '').replace('Docteur ', '')}`;
          else nameStr = 'Cabinet';
          if (!agg[nameStr]) agg[nameStr] = { revenus: 0, enc: 0, patients: 0 };
          agg[nameStr].revenus += Number(v[1]) || 0;
          agg[nameStr].enc += Number(v[2]) || 0;
          agg[nameStr].patients += Number(v[3]) || 0;
        });

        setDataPraticiens(Object.entries(agg).map(([name, d]) => ({
          name,
          revenus: d.revenus,
          enc: d.enc,
          nbPatients: d.patients,
          tauxEnc: d.revenus > 0 ? Math.round(d.enc * 100 / d.revenus) : 0,
        })).sort((a: any, b: any) => b.revenus - a.revenus));
      } else {
        setDataPraticiens([]);
      }

      // Evolution 12 mois
      const evoRes = db.exec(`
        SELECT
          substr(date, 1, 7) as mois,
          SUM(COALESCE(reglement_somme, 0)) as enc,
          SUM(montant_acte) as prod,
          ROUND(SUM(COALESCE(reglement_somme, 0)) * 100.0 / NULLIF(SUM(montant_acte), 0), 1) as tauxEnc
        FROM clinical_acts
        WHERE date IS NOT NULL AND date != '' AND montant_acte > 0
        GROUP BY mois ORDER BY mois ASC LIMIT 12
      `);
      if (evoRes.length > 0) {
        setDataEvolution(evoRes[0].values.map(v => {
          const [y, m] = String(v[0]).split('-');
          return {
            name: `${monthNames[parseInt(m) - 1]} ${y}`,
            encaissement: Number(v[1]) || 0,
            production: Number(v[2]) || 0,
            tauxEnc: Number(v[3]) || 0,
          };
        }));
      } else {
        setDataEvolution([]);
      }

      // Actes (Top 5)
      const aRes = db.exec(`
        SELECT c.libelle, SUM(c.montant_acte) as total
        FROM clinical_acts c
        WHERE c.type = 'ACTE' AND c.montant_acte > 0 ${whereDateAct}
        GROUP BY c.libelle
        ORDER BY total DESC
        LIMIT 5
      `, args);

      if (aRes.length > 0) {
        setDataActes(aRes[0].values.map((v, i) => ({
          name: typeof v[0] === 'string' ? (v[0].length > 30 ? v[0].substring(0, 30) + '...' : v[0]) : 'Acte', 
          value: Number(v[1]) || 0,
          color: COLORS[i % COLORS.length]
        })));
      } else {
        setDataActes([]);
      }

    } catch (e) {
      console.error(e);
    }
  }, [dateRange]);

  const pctDelta = (cur: number, prev: number) =>
    prev > 0 ? Math.round((cur - prev) / prev * 100) : null;

  const DeltaBadge = ({ cur, prev, invertColor = false }: { cur: number; prev: number; invertColor?: boolean }) => {
    const d = pctDelta(cur, prev);
    if (d === null || prev === 0) return null;
    const positive = invertColor ? d < 0 : d > 0;
    const color = positive ? 'var(--green-text)' : 'var(--red-text)';
    return (
      <div style={{ fontSize: '0.72rem', fontWeight: 500, color, marginBottom: '0.2rem', letterSpacing: '0.01em' }}>
        {d > 0 ? '▲' : '▼'} {Math.abs(d)}% <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{prevStats.compLabel}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }} className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <DateRangePicker onRangeChange={(s, e) => setDateRange({ start: s, end: e })} />
      </div>

      {/* KPI strip */}
      <div className="kpi-grid stagger">
        <div className="kpi-card">
          <span className="kpi-label">Honoraires produits</span>
          <div className="kpi-value">{stats.prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
          <DeltaBadge cur={stats.prod} prev={prevStats.prod} />
          {objectifMensuel > 0 && (() => {
            const pct = Math.min(100, Math.round(stats.prod / objectifMensuel * 100));
            const manque = Math.max(0, objectifMensuel - stats.prod);
            const barColor = pct >= 100 ? 'var(--green)' : pct >= 70 ? 'var(--accent)' : 'var(--orange)';
            return (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
                  <span>Objectif mensuel</span>
                  <span style={{ fontWeight: 600, color: barColor }}>{pct}%</span>
                </div>
                <div style={{ height: '5px', borderRadius: '9999px', background: 'var(--separator-opaque)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '9999px', transition: 'width 0.4s ease' }} />
                </div>
                {manque > 0 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
                    Il manque {manque.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} pour atteindre l'objectif
                  </div>
                )}
              </div>
            );
          })()}
          {editingObjectif ? (
            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', alignItems: 'center' }}>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="Ex : 50000"
                value={objectifInput}
                onChange={e => setObjectifInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = Number(objectifInput);
                    if (v > 0) { localStorage.setItem('objectif_mensuel', String(v)); setObjectifMensuel(v); }
                    setEditingObjectif(false);
                  }
                  if (e.key === 'Escape') setEditingObjectif(false);
                }}
                style={{ height: '26px', fontSize: '0.75rem', padding: '0 0.5rem', flex: 1, minWidth: 0 }}
                autoFocus
              />
              <button
                className="btn btn-primary btn-sm"
                style={{ height: '26px', fontSize: '0.72rem', padding: '0 0.6rem' }}
                onClick={() => {
                  const v = Number(objectifInput);
                  if (v > 0) { localStorage.setItem('objectif_mensuel', String(v)); setObjectifMensuel(v); }
                  setEditingObjectif(false);
                }}
              >OK</button>
              <button
                className="btn btn-outline btn-sm"
                style={{ height: '26px', fontSize: '0.72rem', padding: '0 0.6rem' }}
                onClick={() => setEditingObjectif(false)}
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setObjectifInput(objectifMensuel > 0 ? String(objectifMensuel) : ''); setEditingObjectif(true); }}
              style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              {objectifMensuel > 0 ? 'Modifier l\'objectif' : 'Définir un objectif mensuel'}
            </button>
          )}
          <div className="kpi-hint">Total des actes facturés (montant brut avant paiement).</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Encaissement réel</span>
          <div className="kpi-value" style={{ color: 'var(--green-text)' }}>
            {stats.enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </div>
          <DeltaBadge cur={stats.enc} prev={prevStats.enc} />
          <div className="kpi-hint">Somme des règlements effectivement reçus sur la période.</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Reste à encaisser</span>
          <div className="kpi-value" style={{ color: (stats.prod - stats.enc) > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {Math.max(0, stats.prod - stats.enc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </div>
          <DeltaBadge cur={Math.max(0, stats.prod - stats.enc)} prev={Math.max(0, prevStats.prod - prevStats.enc)} invertColor />
          <div className="kpi-hint">Honoraires produits mais pas encore réglés par les patients.</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Panier moyen patient</span>
          <div className="kpi-value">{stats.avgBasket.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
          <DeltaBadge cur={stats.avgBasket} prev={prevStats.avgBasket} />
          <div className="kpi-hint">Production moyenne par patient ({stats.patients} patient{stats.patients !== 1 ? 's' : ''} sur la période).</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tabs-bar" style={{ display: 'flex', alignItems: 'center' }}>
          {[
            { id: 'praticien', label: 'Par praticien' },
            { id: 'acte', label: 'Par type d\'acte' },
            { id: 'evolution', label: 'Évolution 12 mois' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
            >
              {tab.label}
            </button>
          ))}
          <button
            className="btn btn-outline btn-sm"
            style={{ marginLeft: 'auto', marginRight: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={() => {
              const today = new Date().toISOString().slice(0, 7);
              if (activeTab === 'praticien' && dataPraticiens.length > 0) {
                exportCSV(
                  `revenus_praticiens_${today}.csv`,
                  ['Praticien', 'Production (€)', 'Encaissement (€)', 'Taux enc. (%)', 'Nb patients'],
                  dataPraticiens.map((p: any) => [p.name, p.revenus.toFixed(2), p.enc.toFixed(2), p.tauxEnc, p.nbPatients])
                );
              } else if (activeTab === 'acte' && dataActes.length > 0) {
                exportCSV(
                  `revenus_actes_${today}.csv`,
                  ['Acte', 'Total (€)'],
                  dataActes.map((a: any) => [a.name, a.value.toFixed(2)])
                );
              } else if (activeTab === 'evolution' && dataEvolution.length > 0) {
                exportCSV(
                  `revenus_evolution_${today}.csv`,
                  ['Mois', 'Production (€)', 'Encaissement (€)', 'Taux enc. (%)'],
                  dataEvolution.map((m: any) => [m.name, m.production.toFixed(2), m.encaissement.toFixed(2), m.tauxEnc])
                );
              }
            }}
          >
            <Download size={13} />
            CSV
          </button>
        </div>

        <div style={{ padding: '2rem 1.5rem' }}>
          {activeTab === 'praticien' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
              <div>
                <p className="section-subtitle" style={{ marginBottom: '1rem' }}>
                  Production brute par praticien sur la période. Cliquez sur une barre pour le détail.
                </p>
                <div style={{ height: '350px', width: '100%' }}>
                {dataPraticiens.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataPraticiens} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${v.toLocaleString()} €`} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text)', fontWeight: 600 }} width={120} />
                      <Tooltip formatter={(value: any) => Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
                      <Bar dataKey="revenus" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">Aucune donnée liée aux praticiens.</div>
                )}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 className="section-title">Classement praticiens</h3>
                <p className="section-subtitle" style={{ marginBottom: '1rem' }}>Taux d'enc. : vert ≥ 85% · orange ≥ 70% · rouge &lt; 70%</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   {dataPraticiens.map((p, i) => (
                      <li key={i} style={{ padding: '0.75rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{p.name}</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{p.revenus.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontWeight: 600,
                            backgroundColor: p.tauxEnc >= 85 ? 'var(--success-bg)' : p.tauxEnc >= 70 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                            color: p.tauxEnc >= 85 ? 'var(--success-text)' : p.tauxEnc >= 70 ? 'var(--warning-text)' : 'var(--danger-text)',
                          }}>{p.tauxEnc}% enc.</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.nbPatients} patient{p.nbPatients !== 1 ? 's' : ''}</span>
                        </div>
                      </li>
                   ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'evolution' && (
            <div>
              <p className="section-subtitle" style={{ marginBottom: '1.5rem' }}>
                Évolution mensuelle sur 12 mois — barres = volumes (€), ligne violette = taux d'encaissement (%). Un écart croissant entre production et encaissement signale des impayés qui s'accumulent.
              </p>
              {dataEvolution.length > 0 ? (
                <div style={{ height: '400px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dataEvolution} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => `${v.toLocaleString()}€`} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b5cf6' }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                      <Tooltip formatter={(value: any, name: any) => name === 'Taux enc. %' ? `${value}%` : Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
                      <Legend iconType="circle" />
                      <Bar yAxisId="left" dataKey="production" name="Production" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="encaissement" name="Encaissement" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="tauxEnc" name="Taux enc. %" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-empty" style={{ height: '400px' }}>Aucune donnée sur 12 mois.</div>
              )}
            </div>
          )}

          {activeTab === 'acte' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
              <div>
                <p className="section-subtitle" style={{ marginBottom: '1rem' }}>Répartition des 5 actes les plus générateurs de revenus sur la période.</p>
                <div style={{ height: '350px', width: '100%' }}>
                {dataActes.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={dataActes} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                        {dataActes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">Aucune donnée de facturation.</div>
                )}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 className="section-title">Actes les plus générateurs</h3>
                <p className="section-subtitle" style={{ marginBottom: '1rem' }}>Top 5 actes par chiffre d'affaires — utile pour optimiser le planning.</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   {dataActes.map((a, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderLeft: `4px solid ${a.color}`, backgroundColor: 'var(--bg)', borderRadius: '0 0.5rem 0.5rem 0' }}>
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
    </div>
  );
}
