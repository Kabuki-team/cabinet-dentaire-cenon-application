import { useState, useEffect, useRef } from 'react';
import { TablePageSkeleton } from '../components/Skeleton';
import { Search, ChevronRight, ChevronLeft, User, ShieldAlert, CheckCircle2, Link2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDB, saveDB } from '../lib/db';
import { calculateSimilarity } from '../lib/similarity';
import { formatToFrench } from '../lib/dateUtils';

type RiskFilter = 'tous' | 'mauvais_payeur' | 'creance_ancienne' | 'non_reconcilie' | 'inactif';

const RISK_FILTERS: { id: RiskFilter; label: string }[] = [
  { id: 'tous',             label: 'Tous' },
  { id: 'mauvais_payeur',   label: 'Mauvais payeur' },
  { id: 'creance_ancienne', label: 'Créance > 90 j' },
  { id: 'non_reconcilie',   label: 'Non réconcilié' },
  { id: 'inactif',          label: 'Inactif > 12 mois' },
];

// Conditions exprimées sur les colonnes agrégées des LEFT JOINs (aa.*, ca.*)
function getRiskSqlCondition(filter: RiskFilter): string {
  switch (filter) {
    case 'mauvais_payeur':
      return `COALESCE(ca.total_prod, 0) > 0 AND (COALESCE(ca.total_enc, 0) * 100.0 / ca.total_prod) < 60`;
    case 'creance_ancienne':
      return `(COALESCE(ca.total_prod, 0) - COALESCE(ca.total_enc, 0)) > 0.01 AND COALESCE(ca.oldest_act_age, 0) > 90`;
    case 'non_reconcilie':
      return `(p.dossier_logosw IS NULL OR p.dossier_logosw = '')`;
    case 'inactif':
      return `(aa.lastConsult IS NULL OR aa.lastConsult < date('now', '-12 months'))`;
    default:
      return '';
  }
}

const PAGE_SIZE = 50;

export function Patients() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [onlyNonSync, setOnlyNonSync] = useState(false);
  const [onlyInactif, setOnlyInactif] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('tous');
  const [confirmLink, setConfirmLink] = useState<{ patientId: string; patientName: string; suggestionId: string; suggestionName: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search — 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  useEffect(() => { setPage(1); }, [debouncedQuery, onlyNonSync, onlyInactif, riskFilter]);

  useEffect(() => {
    const db = getDB();
    if (!db) return;

    try {
      const conditions: string[] = [];
      const args: any[] = [];

      if (debouncedQuery.trim().length > 0) {
        conditions.push("(p.nom LIKE ? OR p.prenom LIKE ? OR p.nom_doctolib LIKE ? OR p.nom_logosw LIKE ?)");
        const q = `%${debouncedQuery.trim()}%`;
        args.push(q, q, q, q);
      }

      if (onlyNonSync) conditions.push("(p.dossier_logosw IS NULL OR p.dossier_logosw = '')");
      if (onlyInactif) conditions.push("(aa.lastConsult IS NULL OR aa.lastConsult < date('now', '-12 months'))");

      const riskCondition = getRiskSqlCondition(riskFilter);
      if (riskCondition) conditions.push(riskCondition);

      const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      // Derived tables computed once — no correlated subqueries
      const joinSql = `
        FROM patients p
        LEFT JOIN (
          SELECT patient_id,
            MAX(CASE WHEN statut = 'Vu' THEN date END) as lastConsult,
            SUM(CASE WHEN statut = 'Vu' THEN 1 ELSE 0 END) as consult_count
          FROM appointments GROUP BY patient_id
        ) aa ON aa.patient_id = p.id
        LEFT JOIN (
          SELECT patient_id,
            SUM(COALESCE(montant_acte, 0)) as total_prod,
            SUM(COALESCE(reglement_somme, 0)) as total_enc,
            CAST(julianday('now') - julianday(MIN(CASE WHEN montant_acte > 0 THEN date END)) AS INTEGER) as oldest_act_age
          FROM financial_entries GROUP BY patient_id
        ) ca ON ca.patient_id = p.id
        ${whereClause}
      `;

      const countRes = db.exec(`SELECT COUNT(*) ${joinSql}`, args);
      const total = countRes.length > 0 ? Number(countRes[0].values[0][0]) : 0;
      setTotalCount(total);
      setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));

      const res = db.exec(`
        SELECT
          p.id, p.nom, p.prenom, p.has_warning,
          aa.lastConsult,
          COALESCE(aa.consult_count, 0) as consult_count,
          COALESCE(ca.total_prod, 0) as total_prod,
          COALESCE(ca.total_enc, 0) as total_enc,
          p.nom_doctolib, p.nom_logosw, p.dossier_logosw,
          p.date_naissance, p.nom_naissance,
          COALESCE(ca.oldest_act_age, 0) as oldest_act_age
        ${joinSql}
        ORDER BY COALESCE(aa.consult_count, 0) DESC, p.nom ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      `, args);

      if (res.length > 0) {
        setPatients(res[0].values.map(v => {
          const prod = Number(v[6]) || 0;
          const enc  = Number(v[7]) || 0;
          const pending_raw = prod - enc;
          const taux_enc = prod > 0 ? Math.round(enc * 100 / prod) : null;
          const nomDoctolib  = v[8] as string;
          const nomLogosw    = v[9] as string;
          const currentName  = `${v[2] || ''} ${v[1] || ''}`.trim();
          const dob          = v[11] as string;
          const nomNaissance = v[12] as string;
          const oldestActAge = Number(v[13]) || 0;
          const lastConsult  = v[4] as string | null;

          const risks: { label: string; cls: string }[] = [];
          if (taux_enc !== null && taux_enc < 60 && prod > 0)
            risks.push({ label: 'Mauvais payeur', cls: 'badge-danger' });
          if (pending_raw > 0.01 && oldestActAge > 90)
            risks.push({ label: 'Créance > 90 j', cls: 'badge-warning' });
          if (!v[10])
            risks.push({ label: 'Non réconcilié', cls: 'badge-neutral' });
          if (lastConsult && lastConsult < new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10))
            risks.push({ label: 'Inactif', cls: 'badge-neutral' });

          let searchHint = "";
          if (debouncedQuery.trim().length > 0) {
            const q = debouncedQuery.toLowerCase().trim();
            if (nomDoctolib && nomDoctolib.toLowerCase().includes(q) && !currentName.toLowerCase().includes(q))
              searchHint = `Potentiellement Mme/M. ${nomDoctolib}`;
            else if (nomLogosw && nomLogosw.toLowerCase().includes(q) && !currentName.toLowerCase().includes(q))
              searchHint = `Potentiellement Mme/M. ${nomLogosw}`;
          }

          // Suggestion LogosW — uniquement si vue NonSync active
          let suggestion: any = null;
          if (onlyNonSync && !v[10] && dob) {
            try {
              const candidates = db.exec(`SELECT dossier_id, nom, prenom FROM logosw_dictionary WHERE date_naissance = ?`, [dob]);
              if (candidates.length > 0 && candidates[0].values.length > 0) {
                const targetName = `${v[1] || ''} ${v[2] || ''} ${nomNaissance || ''}`;
                let bestS: any = null, bestScore = 0;
                candidates[0].values.forEach((lp: any) => {
                  const score = calculateSimilarity(targetName, `${lp[1] || ''} ${lp[2] || ''}`);
                  if (score > bestScore) { bestScore = score; bestS = { id: lp[0], name: `${lp[1]} ${lp[2]}`.trim(), score }; }
                });
                if (bestS && (candidates[0].values.length === 1 || bestScore >= 30))
                  suggestion = { ...bestS, name: `Mme/M. ${bestS.name}` };
              }
            } catch (e) { /* ignore */ }
          }

          return {
            id: v[0],
            name: currentName,
            searchHint,
            has_warning: Number(v[3]) === 1,
            lastConsult: lastConsult || 'Aucune',
            count: Number(v[5]) || 0,
            prod_raw: prod,
            total_prod: prod.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }),
            total_enc: enc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }),
            pending: pending_raw > 0 ? pending_raw.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'À jour',
            taux_enc,
            dossier_logosw: v[10],
            suggestion,
            risks,
          };
        }));
      } else {
        setPatients([]);
      }
    } catch (e) { console.error("Erreur chargement patients:", e); }
    finally { setLoading(false); }
  }, [debouncedQuery, page, onlyNonSync, onlyInactif, riskFilter]);

  if (loading) return <TablePageSkeleton cols={7} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Confirm link dialog */}
      {confirmLink && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmLink(null)}>
          <div
            className="card"
            style={{ width: '420px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: 'var(--warning-light, #fef3c7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={18} color="var(--warning, #d97706)" />
              </div>
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0 }}>Confirmer le lien LogosW</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.375rem', lineHeight: 1.5 }}>
                  Associer le patient Doctolib <strong>{confirmLink.patientName}</strong> au dossier LogosW <strong>{confirmLink.suggestionName}</strong> ?
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.375rem' }}>
                  Cette action mettra à jour le dossier et ne peut pas être annulée depuis l'interface.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setConfirmLink(null)}>Annuler</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const db = getDB();
                  if (!db) return;
                  db.run('UPDATE patients SET dossier_logosw = ?, nom_logosw = ?, has_warning = 0 WHERE id = ?', [confirmLink.suggestionId, confirmLink.suggestionName, confirmLink.patientId]);
                  await saveDB();
                  window.location.reload();
                }}
              >
                <Link2 size={12} /> Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>

        {/* Toolbar */}
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--separator-opaque)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} size={15} />
            <input
              className="input input-sm"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Rechercher un patient…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className={`btn btn-sm ${onlyNonSync ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => { setOnlyNonSync(!onlyNonSync); if (!onlyNonSync) setOnlyInactif(false); }}
          >
            <ShieldAlert size={13} />
            Non sync
          </button>
          <button
            className={`btn btn-sm ${onlyInactif ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => { setOnlyInactif(!onlyInactif); if (!onlyInactif) setOnlyNonSync(false); }}
          >
            <CheckCircle2 size={13} />
            Inactifs
          </button>

          <div style={{ display: 'flex', gap: '0.375rem', marginLeft: '0.5rem', borderLeft: '1px solid var(--separator-opaque)', paddingLeft: '0.875rem' }}>
            {RISK_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setRiskFilter(f.id)}
                style={{
                  height: '28px', padding: '0 0.65rem',
                  fontSize: '0.72rem', fontWeight: 500,
                  borderRadius: '9999px', border: '1px solid',
                  cursor: 'pointer', transition: 'all 150ms',
                  borderColor: riskFilter === f.id ? 'var(--accent)' : 'var(--separator-opaque)',
                  background:  riskFilter === f.id ? 'var(--accent)' : 'transparent',
                  color:       riskFilter === f.id ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
            {totalCount} patient{totalCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', maxHeight: '600px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                {onlyNonSync && <th>Suggestion LogosW</th>}
                <th>Dernière consultation</th>
                <th>Consultations</th>
                <th>Facturé</th>
                <th>Payé</th>
                <th>En attente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={onlyNonSync ? 8 : 7} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="chart-empty">
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {debouncedQuery.trim() ? `Aucun résultat pour « ${debouncedQuery} »` : 'Aucun patient dans cette sélection.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                patients.map((patient: any, i: number) => (
                  <tr key={i} onClick={() => navigate(`/patients/${patient.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--fill)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={14} color="var(--text-tertiary)" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{patient.name}</span>
                            {patient.has_warning && <ShieldAlert size={13} color="var(--red-text)" />}
                          </div>
                          {patient.risks.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {patient.risks.map((r: any, ri: number) => (
                                <span key={ri} className={`badge ${r.cls}`}>{r.label}</span>
                              ))}
                            </div>
                          )}
                          {patient.searchHint && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{patient.searchHint}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {onlyNonSync && (
                      <td onClick={e => e.stopPropagation()}>
                        {patient.suggestion ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <span className={`badge ${patient.suggestion.score >= 80 ? 'badge-success' : patient.suggestion.score >= 50 ? 'badge-warning' : 'badge-danger'}`}>
                                {patient.suggestion.score}%
                              </span>
                              <span style={{ fontSize: '0.8rem' }}>{patient.suggestion.name}</span>
                            </div>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ width: 'fit-content' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmLink({
                                  patientId: patient.id,
                                  patientName: patient.name,
                                  suggestionId: patient.suggestion.id,
                                  suggestionName: patient.suggestion.name,
                                });
                              }}
                            >
                              <Link2 size={11} /> Confirmer le lien
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Aucune suggestion</span>
                        )}
                      </td>
                    )}

                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {patient.lastConsult === 'Aucune' ? 'Aucune' : formatToFrench(patient.lastConsult)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{patient.count}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem' }}>
                      {patient.total_prod}
                      {patient.taux_enc !== null && patient.prod_raw > 0 && (
                        <span className={`badge ${patient.taux_enc >= 85 ? 'badge-success' : patient.taux_enc >= 70 ? 'badge-warning' : 'badge-danger'}`} style={{ marginLeft: '0.4rem' }}>
                          {patient.taux_enc}%
                        </span>
                      )}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem', color: 'var(--green-text)' }}>{patient.total_enc}</td>
                    <td>
                      {patient.pending !== 'À jour'
                        ? <span className="badge badge-warning">{patient.pending}</span>
                        : <span className="badge badge-success">À jour</span>
                      }
                    </td>
                    <td><ChevronRight size={15} color="var(--text-tertiary)" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--separator-opaque)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Page {page} / {totalPages} — {totalCount} patients
            </span>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft size={14} /> Préc.
              </button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const pn = page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                if (pn < 1 || pn > totalPages) return null;
                return (
                  <button
                    key={pn}
                    onClick={() => setPage(pn)}
                    style={{
                      width: '32px', height: '32px', borderRadius: 'var(--radius)',
                      border: '1px solid var(--separator-opaque)',
                      background: page === pn ? 'var(--accent)' : 'transparent',
                      color: page === pn ? '#fff' : 'var(--text-secondary)',
                      fontWeight: page === pn ? 600 : 400, fontSize: '0.8125rem', cursor: 'pointer',
                    }}
                  >
                    {pn}
                  </button>
                );
              })}
              <button className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Suiv. <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
