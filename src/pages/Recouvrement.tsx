import { useState, useEffect } from 'react';
import { CheckCircle, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDB } from '../lib/db';
import { formatToFrench } from '../lib/dateUtils';
import { exportCSV } from '../lib/exportCsv';

type Tranche = 'tous' | '0-30' | '31-60' | '61-90' | '90+';

const TRANCHES: { id: Tranche; label: string }[] = [
  { id: 'tous',  label: 'Tous' },
  { id: '0-30',  label: '0 – 30 j' },
  { id: '31-60', label: '31 – 60 j' },
  { id: '61-90', label: '61 – 90 j' },
  { id: '90+',   label: '+ 90 j' },
];

function getTranche(days: number): Tranche {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function getBadgeClass(tranche: Tranche) {
  if (tranche === '0-30') return 'badge-success';
  if (tranche === '90+')  return 'badge-danger';
  return 'badge-warning';
}

export function Recouvrement() {
  const navigate = useNavigate();
  const [tranche, setTranche] = useState<Tranche>('tous');
  const [all, setAll] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCreances: 0, nbPatients: 0, moyenneParPatient: 0 });

  useEffect(() => {
    const db = getDB();
    if (!db) return;
    try {
      const res = db.exec(`
        SELECT
          p.id,
          p.nom,
          p.prenom,
          MIN(ca.date) as oldest_date,
          SUM(COALESCE(ca.montant_acte, 0)) as total_facture,
          SUM(COALESCE(ca.reglement_somme, 0)) as total_regle,
          SUM(COALESCE(ca.montant_acte, 0)) - SUM(COALESCE(ca.reglement_somme, 0)) as solde_du,
          CAST(julianday('now') - julianday(MIN(ca.date)) AS INTEGER) as anciennete_jours
        FROM patients p
        JOIN clinical_acts ca ON ca.patient_id = p.id
        WHERE ca.montant_acte > 0
        GROUP BY p.id
        HAVING solde_du > 0.01
        ORDER BY solde_du DESC
      `);

      if (res.length > 0) {
        const rows = res[0].values.map((v: any) => ({
          id: v[0],
          nom: `${v[2] || ''} ${v[1] || ''}`.trim(),
          oldestDate: v[3] ? formatToFrench(String(v[3])) : '—',
          totalFacture: Number(v[4]) || 0,
          totalRegle:   Number(v[5]) || 0,
          soldeDu:      Number(v[6]) || 0,
          anciennete:   Number(v[7]) || 0,
          tranche:      getTranche(Number(v[7]) || 0),
        }));

        const totalCreances = rows.reduce((s: number, r: any) => s + r.soldeDu, 0);
        setAll(rows);
        setStats({
          totalCreances,
          nbPatients: rows.length,
          moyenneParPatient: rows.length > 0 ? totalCreances / rows.length : 0,
        });
      } else {
        setAll([]);
        setStats({ totalCreances: 0, nbPatients: 0, moyenneParPatient: 0 });
      }
    } catch (e) { console.error(e); }
  }, []);

  const filtered = tranche === 'tous' ? all : all.filter(r => r.tranche === tranche);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Total créances</span>
          <div className="kpi-value" style={{ color: stats.totalCreances > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {stats.totalCreances.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </div>
          <div className="kpi-hint">Somme de tous les soldes impayés, tous patients confondus.</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Patients concernés</span>
          <div className="kpi-value">{stats.nbPatients}</div>
          <div className="kpi-hint">Nombre de patients avec au moins un acte non réglé.</div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Créance moyenne / patient</span>
          <div className="kpi-value">
            {stats.moyenneParPatient.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </div>
          <div className="kpi-hint">Solde moyen dû par patient en attente de règlement.</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>

        {/* Filtres */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid var(--separator-opaque)',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginRight: '0.25rem', fontWeight: 500 }}>
            Ancienneté
          </span>
          {TRANCHES.map(t => (
            <button
              key={t.id}
              onClick={() => setTranche(t.id)}
              style={{
                height: '28px',
                padding: '0 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 500,
                borderRadius: '9999px',
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 150ms',
                borderColor:     tranche === t.id ? 'var(--accent)' : 'var(--separator-opaque)',
                background:      tranche === t.id ? 'var(--accent)' : 'transparent',
                color:           tranche === t.id ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t.label}
              {t.id !== 'tous' && all.filter(r => r.tranche === t.id).length > 0 && (
                <span style={{ marginLeft: '0.3rem', opacity: 0.75 }}>
                  {all.filter(r => r.tranche === t.id).length}
                </span>
              )}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            {filtered.length} patient{filtered.length !== 1 ? 's' : ''}
          </span>
          <button
            className="btn btn-outline btn-sm"
            style={{ marginLeft: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={() => {
              const today = new Date().toISOString().slice(0, 7);
              exportCSV(
                `recouvrement_${today}.csv`,
                ['Patient', '1er acte impayé', 'Facturé (€)', 'Réglé (€)', 'Solde dû (€)', 'Ancienneté (j)', 'Tranche'],
                filtered.map((r: any) => [
                  r.nom,
                  r.oldestDate,
                  r.totalFacture.toFixed(2),
                  r.totalRegle.toFixed(2),
                  r.soldeDu.toFixed(2),
                  r.anciennete,
                  r.tranche,
                ])
              );
            }}
          >
            <Download size={13} />
            CSV
          </button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <CheckCircle size={28} style={{ margin: '0 auto 0.875rem', color: 'var(--green)' }} />
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
              Aucune créance dans cette tranche
            </p>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.35rem' }}>
              {all.length === 0
                ? 'Tous les patients sont à jour de leurs règlements.'
                : 'Sélectionnez une autre tranche d\'ancienneté.'}
            </p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>1er acte impayé</th>
                  <th style={{ textAlign: 'right' }}>Facturé</th>
                  <th style={{ textAlign: 'right' }}>Réglé</th>
                  <th style={{ textAlign: 'right' }}>Solde dû</th>
                  <th>Ancienneté</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} onClick={() => navigate(`/patients/${r.id}`)}>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.nom}</td>
                    <td style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.oldestDate}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {r.totalFacture.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--green-text)' }}>
                      {r.totalRegle.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--red-text)' }}>
                      {r.soldeDu.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(r.tranche)}`}>
                        {r.anciennete} j
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
