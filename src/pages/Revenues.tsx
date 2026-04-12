import { useState, useEffect } from 'react';
import { Download, TrendingUp, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';

const COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#f43f5e'];

export function Revenues() {
  const [activeTab, setActiveTab] = useState('praticien');
  const [dateRange, setDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });
  
  const [stats, setStats] = useState({ prod: 0, enc: 0, avgBasket: 0, patients: 0 });
  const [dataPraticiens, setDataPraticiens] = useState<any[]>([]);
  const [dataActes, setDataActes] = useState<any[]>([]);

  useEffect(() => {
    const db = getDB();
    if (!db) return;

    try {
      let whereDateAct = "";
      let whereDateAppt = "";
      const args: string[] = [];

      if (dateRange.start && dateRange.end) {
         const tzOffsetStart = dateRange.start.getTimezoneOffset() * 60000;
         const tzOffsetEnd = dateRange.end.getTimezoneOffset() * 60000;
         const sd = new Date(dateRange.start.getTime() - tzOffsetStart).toISOString().split('T')[0];
         const ed = new Date(dateRange.end.getTime() - tzOffsetEnd).toISOString().split('T')[0];
         
         whereDateAct = " AND c.date >= ? AND c.date <= ?";
         whereDateAppt = " AND a.date >= ? AND a.date <= ?";
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

      // Praticiens
      // To get production per practitioner, group acts by practitioner. We join appointments on patient_id and date.
      // If multiple appointments exist on the same day for a patient, this might duplicate the act if we just JOIN, 
      // but usually the daily production per practitioner is what's needed. We use a subquery to avoid duplication.
      const pRes = db.exec(`
        SELECT 
          CASE WHEN c.logosw_praticien IS NOT NULL AND c.logosw_praticien != 'NC' THEN c.logosw_praticien ELSE (SELECT praticien FROM appointments a WHERE a.patient_id = c.patient_id AND a.date = c.date LIMIT 1) END as praticien,
          SUM(c.montant_acte) as prod
        FROM clinical_acts c
        WHERE c.montant_acte > 0 ${whereDateAct}
        GROUP BY praticien
        ORDER BY prod DESC
      `, args);

      if (pRes.length > 0) {
        const mapNames: Record<string, string> = { 
          "RM": "Dr. Réda Mechouk",
          "RMe": "Dr. RMe (Dr Réda Mechouk externe ?)",
          "RMr": "Dr. RMr (Dr Réda Mechouk remplaçant ?)"
        };
        setDataPraticiens(pRes[0].values.map(v => {
          let nameStr = String(v[0]);
          if (mapNames[nameStr]) nameStr = mapNames[nameStr];
          else if (nameStr && nameStr !== 'NC' && nameStr !== 'null') nameStr = `Dr. ${nameStr.replace('Dr. ', '').replace('Docteur ', '')}`;
          else nameStr = 'Cabinet';
          return {
            name: nameStr,
            revenus: Number(v[1]) || 0
          };
        }));
      } else {
        setDataPraticiens([]);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Revenus & analyses</h1>
          <p style={{ color: 'var(--text-muted)' }}>Analyse financière des honoraires et moyens de paiements par praticien (Import LogosW).</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <DateRangePicker onRangeChange={(s, e) => setDateRange({ start: s, end: e })} />
          <button className="btn btn-outline" disabled><Filter size={18} /> Filtres</button>
          <button className="btn btn-primary" disabled><Download size={18} /> Export</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Honoraires réalisés</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
          </div>
        </div>
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Encaissé</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--success-text)' }}>{stats.enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total En attente</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 600, color: (stats.prod - stats.enc) > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>
            {Math.max(0, stats.prod - stats.enc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Panier moyen ({stats.patients} pat.)</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.avgBasket.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '2rem' }}>
          {[
            { id: 'praticien', label: 'Par praticien' },
            { id: 'acte', label: 'Par type d\'acte' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '1rem 0',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--primary)' : 'transparent'}`,
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 500 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '2rem 1.5rem' }}>
          {activeTab === 'praticien' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
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
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Aucune donnée liée aux praticiens.</div>
                )}
              </div>
              <div style={{ textAlign: 'left', padding: '1rem 2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Top Praticiens (Honoraires)</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   {dataPraticiens.map((p, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'var(--bg)', borderRadius: '0.5rem' }}>
                         <span style={{ fontWeight: 500 }}>{p.name}</span>
                         <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{p.revenus.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                      </li>
                   ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'acte' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'center' }}>
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
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Aucune donnée de facturation.</div>
                )}
              </div>
              <div style={{ textAlign: 'left', padding: '1rem 2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Actes les plus générateurs (Top 5)</h3>
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
