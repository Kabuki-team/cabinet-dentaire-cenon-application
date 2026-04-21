import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, Download, Search, ChevronLeft, ChevronRight, Edit3, AlertTriangle } from 'lucide-react';
import { TablePageSkeleton } from '../components/Skeleton';
import { useNavigate } from 'react-router-dom';
import { getDB } from '../lib/db';
import { formatToFrench } from '../lib/dateUtils';
import { exportCSV } from '../lib/exportCsv';
import { AdjustmentModal } from '../components/AdjustmentModal';

type Tranche = 'tous' | '0-10' | '11-30' | '31-60' | '61-90' | '90+';

const TRANCHES: { id: Tranche; label: string }[] = [
  { id: 'tous',  label: 'Tous' },
  { id: '0-10',  label: '0 – 10 j' },
  { id: '11-30', label: '11 – 30 j' },
  { id: '31-60', label: '31 – 60 j' },
  { id: '61-90', label: '61 – 90 j' },
  { id: '90+',   label: '+ 90 j' },
];

const PAGE_SIZE = 25;
const OVERDUE_THRESHOLD = 30;

function getTranche(days: number): Tranche {
  if (days <= 10) return '0-10';
  if (days <= 30) return '11-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function getBadgeClass(tranche: Tranche) {
  if (tranche === '0-10' || tranche === '11-30') return 'badge-success';
  if (tranche === '90+')  return 'badge-danger';
  return 'badge-warning';
}

export function Recouvrement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tranche, setTranche] = useState<Tranche>('tous');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [all, setAll] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCreances: 0, nbPatients: 0, moyenneParPatient: 0, nbOverdue: 0, totalOverdue: 0 });
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ id: number; name: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const db = getDB();
    if (!db) return;
    try {
      // Utilise la VIEW financial_entries pour inclure les ajustements manuels dans le calcul des créances.
      const res = db.exec(`
        SELECT
          p.id,
          p.nom,
          p.prenom,
          MIN(CASE WHEN f.montant_acte > 0 THEN f.date END) as oldest_date,
          SUM(COALESCE(f.montant_acte, 0)) as total_facture,
          SUM(COALESCE(f.reglement_somme, 0)) as total_regle,
          SUM(COALESCE(f.montant_acte, 0)) - SUM(COALESCE(f.reglement_somme, 0)) as solde_du,
          CAST(julianday('now') - julianday(MIN(CASE WHEN f.montant_acte > 0 THEN f.date END)) AS INTEGER) as anciennete_jours,
          SUM(CASE WHEN f.is_manual = 1 THEN 1 ELSE 0 END) as nb_ajustements
        FROM patients p
        JOIN financial_entries f ON f.patient_id = p.id
        GROUP BY p.id
        HAVING (SUM(COALESCE(f.montant_acte, 0)) - SUM(COALESCE(f.reglement_somme, 0))) > 0.01
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
          nbAjustements: Number(v[8]) || 0,
        }));

        const totalCreances = rows.reduce((s: number, r: any) => s + r.soldeDu, 0);
        const overdueRows = rows.filter((r: any) => r.anciennete > OVERDUE_THRESHOLD);
        const totalOverdue = overdueRows.reduce((s: number, r: any) => s + r.soldeDu, 0);
        setAll(rows);
        setStats({
          totalCreances,
          nbPatients: rows.length,
          moyenneParPatient: rows.length > 0 ? totalCreances / rows.length : 0,
          nbOverdue: overdueRows.length,
          totalOverdue,
        });
      } else {
        setAll([]);
        setStats({ totalCreances: 0, nbPatients: 0, moyenneParPatient: 0, nbOverdue: 0, totalOverdue: 0 });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [refreshKey]);

  // Reset page on filter/search change
  useEffect(() => { setPage(1); }, [tranche, search]);

  const filtered = useMemo(() => {
    let rows = tranche === 'tous' ? all : all.filter(r => r.tranche === tranche);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => r.nom.toLowerCase().includes(q));
    }
    return rows;
  }, [all, tranche, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <TablePageSkeleton kpis={3} cols={6} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">

      {/* Notification : créances > 30 jours */}
      {stats.nbOverdue > 0 && (
        <div
          className="alert alert--danger"
          role="alert"
          style={{ cursor: 'pointer', justifyContent: 'space-between' }}
          onClick={() => setTranche('31-60')}
          title="Filtrer sur la tranche 31 – 60 j"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem' }}>
            <AlertTriangle size={16} />
            <span>
              <strong>{stats.nbOverdue}</strong> créance{stats.nbOverdue > 1 ? 's' : ''} de plus de 30 jours
              {' — '}
              <strong>{stats.totalOverdue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong>
              {' '}nécessite{stats.nbOverdue > 1 ? 'nt' : ''} un suivi prioritaire.
            </span>
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, opacity: 0.75 }}>Filtrer ›</span>
        </div>
      )}

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

        {/* Toolbar — ligne 1 : searchbar */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid var(--separator-opaque)',
        }}>
          <div style={{ position: 'relative', maxWidth: '320px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              className="input"
              type="text"
              placeholder="Rechercher un patient..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '2rem', height: '32px', fontSize: '0.8rem', width: '100%' }}
            />
          </div>
        </div>

        {/* Toolbar — ligne 2 : filtres tranche + compteur + export */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.625rem 1.25rem',
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
                borderColor: tranche === t.id ? 'var(--accent)' : 'var(--separator-opaque)',
                background:  tranche === t.id ? 'var(--accent)' : 'transparent',
                color:       tranche === t.id ? '#fff' : 'var(--text-secondary)',
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
                  r.nom, r.oldestDate,
                  r.totalFacture.toFixed(2), r.totalRegle.toFixed(2), r.soldeDu.toFixed(2),
                  r.anciennete, r.tranche,
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
              {search ? 'Aucun patient trouvé' : 'Aucune créance dans cette tranche'}
            </p>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.35rem' }}>
              {all.length === 0
                ? 'Tous les patients sont à jour de leurs règlements.'
                : search
                  ? 'Essayez un autre nom.'
                  : 'Sélectionnez une autre tranche d\'ancienneté.'}
            </p>
          </div>
        ) : (
          <>
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
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r: any) => {
                    const isOverdue = r.anciennete > OVERDUE_THRESHOLD;
                    return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/patients/${r.id}`)}
                      style={{
                        cursor: 'pointer',
                        background: isOverdue ? 'var(--red-bg)' : undefined,
                        boxShadow: isOverdue ? 'inset 3px 0 0 var(--red)' : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          {isOverdue && (
                            <AlertTriangle
                              size={13}
                              style={{ color: 'var(--red)', flexShrink: 0 }}
                              aria-label="Créance en retard (> 30 jours)"
                            />
                          )}
                          {r.nom}
                          {r.nbAjustements > 0 && (
                            <span
                              title={`${r.nbAjustements} ajustement${r.nbAjustements > 1 ? 's' : ''} manuel${r.nbAjustements > 1 ? 's' : ''}`}
                              style={{
                                fontSize: '0.62rem',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '9999px',
                                backgroundColor: '#ede9fe',
                                color: '#6d28d9',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                            >
                              <Edit3 size={9} />
                              {r.nbAjustements}
                            </span>
                          )}
                        </span>
                      </td>
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
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', color: '#6d28d9', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          onClick={() => setAdjustmentTarget({ id: r.id, name: r.nom })}
                          title="Ajouter un ajustement manuel"
                        >
                          <Edit3 size={12} /> Ajuster
                        </button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid var(--separator-opaque)',
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn btn-ghost"
                    style={{ padding: '0.25rem 0.5rem', opacity: page === 1 ? 0.4 : 1 }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | '...')[]>((acc, p, i, arr) => {
                      if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) => p === '...'
                      ? <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>…</span>
                      : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className="btn btn-ghost"
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.8rem',
                            fontWeight: page === p ? 700 : 400,
                            background: page === p ? 'var(--primary-light)' : 'transparent',
                            color: page === p ? 'var(--primary)' : 'var(--text-secondary)',
                            borderRadius: '0.375rem',
                          }}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn btn-ghost"
                    style={{ padding: '0.25rem 0.5rem', opacity: page === totalPages ? 0.4 : 1 }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {adjustmentTarget && (
        <AdjustmentModal
          patientId={adjustmentTarget.id}
          patientName={adjustmentTarget.name}
          onClose={() => setAdjustmentTarget(null)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
