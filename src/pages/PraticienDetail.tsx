import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, ChevronLeft, Users, Calendar, TrendingUp, Wallet,
  Inbox, Percent, Download, ArrowUp, ArrowDown, UserX, Receipt, Search, X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';
import { formatToFrench } from '../lib/dateUtils';
import { exportCSV } from '../lib/exportCsv';
import { normalizeString } from '../lib/similarity';
import { ATTRIBUTION_SQL, EMPTY_STATS, initialesDe, type PraticienStats } from '../lib/praticiens';
import { dateDepuisISO, moisCourant, usePeriodePartagee, usePersistedState } from '../lib/persistedState';

const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const PAGE_SIZE = 25;

type SortKey = 'date' | 'nbConsult' | 'prod' | 'enc' | 'reste';
type Filtre = 'tous' | 'impayes' | 'soldes' | 'sansActe' | 'multi';
type Onglet = 'patients' | 'actes' | 'evolution';

const FILTRES: { id: Filtre; label: string; hint: string }[] = [
  { id: 'tous', label: 'Tous', hint: 'Tous les patients vus par ce praticien.' },
  { id: 'impayes', label: 'Reste dû', hint: 'Production supérieure aux règlements encaissés.' },
  { id: 'soldes', label: 'Soldés', hint: 'Intégralement réglés sur la période.' },
  { id: 'sansActe', label: 'Sans acte', hint: 'Consultation honorée sans acte facturé — oubli de saisie probable.' },
  { id: 'multi', label: 'Multi-RDV', hint: 'Au moins deux consultations sur la période.' },
];

const formatEUR = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const isoDe = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

export function PraticienDetail() {
  const { nom } = useParams<{ nom: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const praticien = decodeURIComponent(nom ?? '');

  const [periodePartagee, setPeriodePartagee] = usePeriodePartagee();

  // Trois sources, dans cet ordre : l'URL (lien partagé, rechargement), la période
  // mémorisée pour la session, puis le mois courant. Contrairement au dashboard qui
  // traite l'absence de période comme « mois courant » implicite, cette page l'affiche
  // en toutes lettres — le sélecteur et le sous-titre doivent dire la même chose.
  const debutParam = searchParams.get('debut');
  const finParam = searchParams.get('fin');
  const dateRange = useMemo<{ start: Date; end: Date }>(() => {
    if (debutParam && finParam) return { start: dateDepuisISO(debutParam), end: dateDepuisISO(finParam) };
    if (periodePartagee.start && periodePartagee.end) return { start: periodePartagee.start, end: periodePartagee.end };
    return moisCourant();
  }, [debutParam, finParam, periodePartagee]);

  const [stats, setStats] = useState<PraticienStats | null>(null);
  const [onglet, setOnglet] = usePersistedState<Onglet>('praticien.onglet', 'patients');
  const [sort, setSort] = usePersistedState<{ key: SortKey; dir: 'asc' | 'desc' }>('praticien.tri', { key: 'prod', dir: 'desc' });
  const [query, setQuery] = usePersistedState('praticien.recherche', '');
  const [filtre, setFiltre] = usePersistedState<Filtre>('praticien.filtre', 'tous');
  const [page, setPage] = useState(0);

  // Un filtre, une recherche, un tri ou un changement d'onglet peut réduire la liste
  // sous la page courante : on repart de la première.
  const majOnglet = (v: Onglet) => { setOnglet(v); setPage(0); };
  const majQuery = (v: string) => { setQuery(v); setPage(0); };
  const majFiltre = (v: Filtre) => { setFiltre(v); setPage(0); };

  // Les agrégats sont calculés en SQL et non à partir de la liste patients : celle-ci est
  // plafonnée, des totaux dérivés du tableau seraient faux dès que le plafond est atteint.
  useEffect(() => {
    const db = getDB();
    if (!db || !praticien) return;

    const charger = () => {
      try {
        let whereDateAppt = "";
        let whereDateAct = "";
        const dateArgs: string[] = [];

        if (dateRange.start && dateRange.end) {
          whereDateAppt = " AND a.date >= ? AND a.date <= ?";
          whereDateAct = " AND c.date >= ? AND c.date <= ?";
          dateArgs.push(isoDe(dateRange.start), isoDe(dateRange.end));
        }

        // Toutes les écritures de la période, étiquetées avec leur praticien attribué.
        const attCTE = `
          att AS (
            SELECT c.patient_id, c.date, c.libelle, c.type, c.montant_acte, c.reglement_somme,
                   ${ATTRIBUTION_SQL} AS prat
            FROM financial_entries c
            WHERE 1 = 1 ${whereDateAct}
          )`;
        // LogosW étiquette en initiales, Doctolib en nom complet : on accepte les deux.
        const pratKeys = [praticien, ...initialesDe(praticien)];
        const pratIn = `prat IN (${pratKeys.map(() => '?').join(', ')})`;

        const num = (v: unknown) => Number(v) || 0;
        const one = (sql: string, args: string[]) => db.exec(sql, args)[0]?.values[0] ?? [];
        const many = (sql: string, args: string[]) => db.exec(sql, args)[0]?.values ?? [];

        // 1. Volumétrie rendez-vous : patients distincts, consultations honorées, absences.
        const rdv = one(`
          SELECT COUNT(DISTINCT CASE WHEN a.statut = 'Vu' THEN a.patient_id END),
                 SUM(CASE WHEN a.statut = 'Vu' THEN 1 ELSE 0 END),
                 COUNT(a.id)
          FROM appointments a
          WHERE a.praticien = ? ${whereDateAppt}`, [praticien, ...dateArgs]);

        // 2. Production / encaissement attribués au praticien.
        const fin = one(`
          WITH ${attCTE}
          SELECT COALESCE(SUM(montant_acte), 0), COALESCE(SUM(reglement_somme), 0)
          FROM att WHERE ${pratIn}`, [...dateArgs, ...pratKeys]);

        // 3. Répartition par type d'acte.
        const actes = many(`
          WITH ${attCTE}
          SELECT libelle, COUNT(*), SUM(montant_acte)
          FROM att WHERE ${pratIn} AND type = 'ACTE' AND montant_acte > 0
          GROUP BY libelle ORDER BY 3 DESC`, [...dateArgs, ...pratKeys]);

        // 4. Évolution mensuelle.
        const months = many(`
          WITH ${attCTE}
          SELECT substr(date, 1, 7), COALESCE(SUM(montant_acte), 0), COALESCE(SUM(reglement_somme), 0)
          FROM att WHERE ${pratIn} AND date IS NOT NULL
          GROUP BY 1 ORDER BY 1`, [...dateArgs, ...pratKeys]);

        // 5. Détail par patient. Plafond large : filtre, tri et pagination se font côté client.
        const rows = many(`
          WITH ${attCTE},
          vus AS (
            SELECT a.patient_id AS pid, COUNT(*) AS nb, MAX(a.date) AS derniere
            FROM appointments a
            WHERE a.praticien = ? AND a.statut = 'Vu' ${whereDateAppt}
            GROUP BY a.patient_id
          )
          SELECT p.id, p.nom, p.prenom, v.nb, v.derniere,
                 COALESCE(s.prod, 0), COALESCE(s.enc, 0)
          FROM vus v
          JOIN patients p ON p.id = v.pid
          LEFT JOIN (
            SELECT patient_id, SUM(montant_acte) AS prod, SUM(reglement_somme) AS enc
            FROM att WHERE ${pratIn} GROUP BY patient_id
          ) s ON s.patient_id = v.pid
          ORDER BY 6 DESC, 5 DESC
          LIMIT 2000`, [...dateArgs, praticien, ...dateArgs, ...pratKeys]);

        setStats({
          patients: num(rdv[0]),
          consults: num(rdv[1]),
          rdvTotal: num(rdv[2]),
          absences: num(rdv[2]) - num(rdv[1]),
          prod: num(fin[0]),
          enc: num(fin[1]),
          rows: rows.map(v => ({
            patientId: num(v[0]),
            patientName: `${v[2] || ''} ${v[1] || ''}`.trim(),
            nbConsult: num(v[3]),
            dateISO: v[4] ? String(v[4]) : '',
            date: v[4] ? formatToFrench(String(v[4])) : 'Date NC',
            prod: num(v[5]),
            enc: num(v[6]),
          })),
          actes: actes.map(v => ({ libelle: String(v[0] || 'Non renseigné'), nb: num(v[1]), prod: num(v[2]) })),
          months: months.map(v => {
            const [y, m] = String(v[0]).split('-');
            return { label: `${monthNames[Number(m) - 1] ?? m} ${y?.slice(2) ?? ''}`, prod: num(v[1]), enc: num(v[2]) };
          }),
        });
      } catch (e) {
        console.error(e);
        setStats(EMPTY_STATS);
      }
    };

    charger();
  }, [praticien, dateRange]);

  const s = stats ?? EMPTY_STATS;

  // Recherche insensible aux accents et à la casse — même normalisation que le
  // rapprochement de dossiers, pour que « Theo » trouve « Théo ».
  const q = normalizeString(query);

  const passeFiltre = (r: PraticienStats['rows'][number]) => {
    if (filtre === 'impayes') return r.prod - r.enc > 0;
    if (filtre === 'soldes') return r.prod > 0 && r.prod - r.enc <= 0;
    if (filtre === 'sansActe') return r.prod === 0;
    if (filtre === 'multi') return r.nbConsult > 1;
    return true;
  };

  const sortValue = (r: PraticienStats['rows'][number]) =>
    sort.key === 'date' ? r.dateISO
    : sort.key === 'reste' ? r.prod - r.enc
    : r[sort.key];

  const lignes = s.rows
    .filter(r => passeFiltre(r) && (!q || normalizeString(r.patientName).includes(q)))
    .sort((a, b) => {
      const va = sortValue(a), vb = sortValue(b);
      const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  const actesFiltres = s.actes.filter(a => !q || normalizeString(a.libelle).includes(q));

  const courants: { length: number } = onglet === 'actes' ? actesFiltres : lignes;
  const nbPages = Math.max(1, Math.ceil(courants.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages - 1);
  const debut = pageCourante * PAGE_SIZE;
  const pageLignes = lignes.slice(debut, debut + PAGE_SIZE);
  const pageActes = actesFiltres.slice(debut, debut + PAGE_SIZE);

  // Sous-total de la sélection : les indicateurs du bandeau restent sur la période
  // entière, cette ligne dit ce que vaut le sous-ensemble affiché.
  const selection = lignes.reduce((acc, r) => ({ prod: acc.prod + r.prod, enc: acc.enc + r.enc }), { prod: 0, enc: 0 });
  const filtreActif = filtre !== 'tous' || q !== '';

  const tauxEnc = s.prod > 0 ? Math.round(s.enc / s.prod * 100) : 0;
  const panierMoyen = s.consults > 0 ? s.prod / s.consults : 0;
  const tauxAbsence = s.rdvTotal > 0 ? Math.round(s.absences / s.rdvTotal * 100) : 0;
  const reste = s.prod - s.enc;
  const maxActe = Math.max(1, ...s.actes.map(a => a.prod));

  const initiales = praticien.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const periodeLabel = `du ${dateRange.start.toLocaleDateString('fr-FR')} au ${dateRange.end.toLocaleDateString('fr-FR')}`;
  const slug = praticien.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

  const toggleSort = (key: SortKey) => {
    setSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
    setPage(0);
  };

  const onRangeChange = (start: Date | null, end: Date | null) => {
    setPeriodePartagee(start, end);
    setSearchParams(start && end ? { debut: isoDe(start), fin: isoDe(end) } : {}, { replace: true });
  };

  // L'export suit ce qui est affiché : filtre et recherche compris, pagination exclue.
  const exporter = () => {
    if (onglet === 'actes') {
      exportCSV(`actes-${slug}.csv`, ['Acte', 'Nombre', 'Production EUR'],
        actesFiltres.map(a => [a.libelle, a.nb, a.prod.toFixed(2)]));
    } else if (onglet === 'evolution') {
      exportCSV(`evolution-${slug}.csv`, ['Mois', 'Production EUR', 'Encaissé EUR'],
        s.months.map(m => [m.label, m.prod.toFixed(2), m.enc.toFixed(2)]));
    } else {
      exportCSV(`patients-${slug}.csv`, ['Dernière consultation', 'Patient', 'Consultations', 'Production EUR', 'Encaissé EUR', 'Reste dû EUR'],
        lignes.map(r => [r.date, r.patientName, r.nbConsult, r.prod.toFixed(2), r.enc.toFixed(2), (r.prod - r.enc).toFixed(2)]));
    }
  };

  const kpis = [
    { icon: <Users size={16} />, label: 'Patients', value: String(s.patients), color: 'var(--primary)', hint: 'Patients distincts vus sur la période.' },
    { icon: <Calendar size={16} />, label: 'Consult.', value: String(s.consults), color: 'var(--text)', hint: `${s.rdvTotal} rendez-vous planifiés au total.` },
    { icon: <TrendingUp size={16} />, label: 'Production', value: formatEUR(s.prod), color: 'var(--warning-text)', hint: 'Actes attribués au praticien (initiales LogosW, sinon praticien du RDV).' },
    { icon: <Wallet size={16} />, label: 'Encaissé', value: formatEUR(s.enc), color: 'var(--success-text)', hint: 'Règlements attribués au praticien.' },
    { icon: <Percent size={16} />, label: 'Taux enc.', value: `${tauxEnc}%`, color: tauxEnc >= 85 ? 'var(--success-text)' : 'var(--warning-text)', hint: `Reste dû : ${formatEUR(reste)}.` },
    { icon: <Receipt size={16} />, label: 'Panier moyen', value: formatEUR(panierMoyen), color: 'var(--text)', hint: 'Production divisée par le nombre de consultations.' },
    { icon: <UserX size={16} />, label: 'Absences', value: `${tauxAbsence}%`, color: tauxAbsence > 10 ? 'var(--danger-text, #b91c1c)' : 'var(--text)', hint: `${s.absences} RDV annulés ou non honorés.` },
  ];

  const onglets: { id: Onglet; label: string }[] = [
    { id: 'patients', label: `Patients (${lignes.length})` },
    { id: 'actes', label: `Actes (${actesFiltres.length})` },
    { id: 'evolution', label: 'Évolution' },
  ];

  const thStyle: React.CSSProperties = { padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };

  const enteteTriable = (label: string, sortKey: SortKey, align: 'left' | 'right' = 'right') => (
    <th
      key={sortKey}
      style={{ ...thStyle, textAlign: align, cursor: 'pointer', userSelect: 'none', color: sort.key === sortKey ? 'var(--accent)' : 'var(--text-muted)' }}
      onClick={() => toggleSort(sortKey)}
      title="Trier sur cette colonne"
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
        {label}
        {sort.key === sortKey && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  const vide = (msg: string) => (
    <div style={{ padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
      <Inbox size={36} style={{ opacity: 0.5 }} />
      <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg}</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ padding: '0.5rem' }} aria-label="Retour au tableau de bord">
            <ArrowLeft size={18} />
          </button>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.95rem', flexShrink: 0 }}>
            {initiales || '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{praticien}</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>Activité {periodeLabel}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <DateRangePicker
            initialDate={dateRange.start}
            initialEndDate={dateRange.end}
            onRangeChange={onRangeChange}
          />
          <button className="btn btn-outline" onClick={exporter} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Download size={15} /> Exporter
          </button>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: '1px', backgroundColor: 'var(--border)' }}>
          {kpis.map((kpi, idx) => (
            <div key={idx} title={kpi.hint} style={{ backgroundColor: 'var(--card)', padding: '1rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {kpi.icon}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: kpi.color, fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tabs-bar">
          {onglets.map(t => (
            <button key={t.id} className={`tab-btn${onglet === t.id ? ' active' : ''}`} onClick={() => majOnglet(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Barre de recherche et filtres */}
        {onglet !== 'evolution' && (
          <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '360px' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                className="input"
                style={{ paddingLeft: '2.1rem', paddingRight: query ? '2.1rem' : undefined }}
                placeholder={onglet === 'actes' ? 'Rechercher un acte…' : 'Rechercher un patient…'}
                value={query}
                onChange={e => majQuery(e.target.value)}
              />
              {query && (
                <button
                  onClick={() => majQuery('')}
                  aria-label="Effacer la recherche"
                  style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {onglet === 'patients' && (
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {FILTRES.map(f => (
                  <button
                    key={f.id}
                    title={f.hint}
                    onClick={() => majFiltre(f.id)}
                    style={{
                      padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                      borderRadius: '9999px',
                      border: `1px solid ${filtre === f.id ? 'var(--primary)' : 'var(--border)'}`,
                      background: filtre === f.id ? 'var(--primary-light)' : 'transparent',
                      color: filtre === f.id ? 'var(--primary)' : 'var(--text-muted)',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {onglet === 'patients' && filtreActif && (
              <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                Sélection : <strong style={{ color: 'var(--text)' }}>{lignes.length}</strong> patients ·
                {' '}{formatEUR(selection.prod)} produits ·
                {' '}<span style={{ color: 'var(--success-text)' }}>{formatEUR(selection.enc)} encaissés</span>
              </div>
            )}
          </div>
        )}

        {/* Onglet Patients */}
        {onglet === 'patients' && (
          lignes.length === 0 ? vide(filtreActif ? 'Aucun patient ne correspond à cette recherche.' : 'Aucune consultation sur la période.') : (
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg)', boxShadow: '0 1px 0 var(--border)' }}>
                    {enteteTriable('Dernière consult.', 'date', 'left')}
                    <th style={{ ...thStyle, textAlign: 'left' }}>Patient</th>
                    {enteteTriable('RDV', 'nbConsult')}
                    {enteteTriable('Production', 'prod')}
                    {enteteTriable('Encaissé', 'enc')}
                    {enteteTriable('Reste dû', 'reste')}
                    <th style={{ width: '32px', padding: '0.75rem 1rem 0.75rem 0' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageLignes.map((det, i) => {
                    const resteDu = det.prod - det.enc;
                    return (
                      <tr
                        key={det.patientId}
                        style={{ backgroundColor: i % 2 === 0 ? 'var(--card)' : 'var(--bg)', cursor: 'pointer', transition: 'background-color 0.15s' }}
                        onClick={() => navigate(`/patients/${det.patientId}`)}
                        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--primary-light)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'var(--card)' : 'var(--bg)'; }}
                      >
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{det.date}</td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}>{det.patientName}</td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--text-muted)' }}>{det.nbConsult}</td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', textAlign: 'right', fontWeight: 500, color: det.prod > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                          {det.prod > 0 ? formatEUR(det.prod) : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', textAlign: 'right', fontWeight: 600, color: det.enc > 0 ? 'var(--success-text)' : 'var(--text-muted)' }}>
                          {det.enc > 0 ? formatEUR(det.enc) : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', textAlign: 'right', fontWeight: 600, color: resteDu > 0 ? 'var(--warning-text)' : 'var(--text-muted)' }}>
                          {resteDu > 0 ? formatEUR(resteDu) : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem 0.85rem 0', textAlign: 'right', color: 'var(--text-muted)' }}>
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Onglet Actes */}
        {onglet === 'actes' && (
          actesFiltres.length === 0 ? vide(q ? 'Aucun acte ne correspond à cette recherche.' : 'Aucun acte facturé sur la période.') : (
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg)', boxShadow: '0 1px 0 var(--border)' }}>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Acte</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Nombre</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Production</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Part</th>
                    <th style={{ ...thStyle, width: '30%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageActes.map((a, i) => (
                    <tr key={a.libelle} style={{ backgroundColor: i % 2 === 0 ? 'var(--card)' : 'var(--bg)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', fontWeight: 500 }}>{a.libelle}</td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--text-muted)' }}>{a.nb}</td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', textAlign: 'right', fontWeight: 600 }}>{formatEUR(a.prod)}</td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {s.prod > 0 ? `${Math.round(a.prod / s.prod * 100)}%` : '—'}
                      </td>
                      <td style={{ padding: '0.85rem 1.5rem 0.85rem 0' }}>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${Math.round(a.prod / maxActe * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Onglet Évolution */}
        {onglet === 'evolution' && (
          s.months.length === 0 ? vide('Aucune écriture financière sur la période.') : (
            <div style={{ padding: '1.5rem', height: '380px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.months} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} width={80} />
                  <Tooltip formatter={(v) => formatEUR(Number(v))} contentStyle={{ borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                  <Bar dataKey="prod" name="Production" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="enc" name="Encaissé" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        )}

        {/* Pagination */}
        {onglet !== 'evolution' && courants.length > 0 && (
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {debut + 1}–{Math.min(debut + PAGE_SIZE, courants.length)} sur {courants.length}
            </span>
            {nbPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={pageCourante === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', opacity: pageCourante === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={15} /> Précédent
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: '90px', textAlign: 'center' }}>
                  Page {pageCourante + 1} / {nbPages}
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))}
                  disabled={pageCourante >= nbPages - 1}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', opacity: pageCourante >= nbPages - 1 ? 0.4 : 1 }}
                >
                  Suivant <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
