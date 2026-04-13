import { useState, useEffect } from 'react';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';
import { useNavigate } from 'react-router-dom';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay(); // 0 = dim, 1 = lun…
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function Activity() {
  const _today = new Date();
  const _todayISO = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string>(_todayISO);
  const [viewMode, setViewMode] = useState<'jour' | 'semaine'>('jour');
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState({ vus: 0, reglements: 0 });
  const [weekData, setWeekData] = useState<{ date: string; vus: number; prod: number; enc: number }[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (viewMode === 'jour') {
      loadDayData(selectedDate);
    } else {
      loadWeekData(selectedDate);
    }
  }, [selectedDate, viewMode]);

  const loadDayData = (date: string) => {
    const db = getDB();
    if (!db || !date) return;

    try {
      const actesRes = db.exec(`
        SELECT
          ca.id, ca.date, p.nom, p.prenom, ca.logosw_praticien, ca.libelle, ca.montant_acte, ca.reglement_somme, ca.type, ca.source, p.id as pId
        FROM clinical_acts ca
        JOIN patients p ON ca.patient_id = p.id
        WHERE ca.date = ?
      `, [date]);

      const rdvRes = db.exec(`
        SELECT
          a.id, a.heure, p.nom, p.prenom, a.praticien, a.motif, a.statut, p.id as pId, a.date
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.date = ?
      `, [date]);

      let vus = 0;
      let reglementsCount = 0;
      const entriesMap: Record<string, any> = {};

      const MAP_PRATICIENS: Record<string, string> = {
        "RM": "Dr. Réda Mechouk",
        "MF": "Dr. Medy Fakreldin",
        "HG": "Dr. Hamza Gafsi",
        "JL": "Dr. Jean Laborde Barbanegre",
        "MFr": "Dr. Benoit Say-Liang-Fat",
        "RMr": "Dr. Benoit Say-Liang-Fat",
        "RMe": "Etudiant non Thèsé",
        "MFe": "Etudiant non Thèsé"
      };

      if (rdvRes.length > 0) {
        rdvRes[0].values.forEach(v => {
           if (v[6] === 'Vu') vus++;
           const pId = String(v[7]);
           entriesMap[pId] = {
             type_row: 'rdv',
             time: v[1] || '---',
             patient: `${v[3] || ''} ${v[2] || ''}`.trim(),
             praticien: v[4],
             acte: v[5] || 'Consultation',
             amount: 0,
             reglement: 0,
             status: v[6],
             source: 'Doctolib',
             patientId: pId,
             actsList: []
           };
        });
      }

      if (actesRes.length > 0) {
        actesRes[0].values.forEach(v => {
           if (v[8] === 'REGLEMENT' || Number(v[7]) > 0) reglementsCount++;

           const montant = Number(v[6]) || 0;
           const reglement = Number(v[7]) || 0;
           if (montant === 0 && reglement === 0) return;

           const pId = String(v[10]);
           let logosP = v[4] && v[4] !== 'NC' ? String(v[4]) : '';
           if (MAP_PRATICIENS[logosP]) logosP = MAP_PRATICIENS[logosP];

           const acteLibelle = v[5] || (v[8] === 'REGLEMENT' ? 'Règlement' : 'Acte');

           if (entriesMap[pId]) {
               entriesMap[pId].amount += montant;
               entriesMap[pId].reglement += reglement;
               entriesMap[pId].source = 'Doctolib + LogosW';
               entriesMap[pId].actsList.push(acteLibelle);
               if (logosP) entriesMap[pId].praticien = logosP;
           } else {
               let status = 'En attente';
               if (reglement >= montant && montant > 0) status = 'Encaissé';
               else if (reglement > 0) status = 'Acompte';
               else if (v[8] === 'REGLEMENT') status = 'Encaissé';

               entriesMap[`logos_${v[0]}`] = {
                 type_row: 'acte',
                 time: '---',
                 patient: `${v[3] || ''} ${v[2] || ''}`.trim(),
                 praticien: logosP || 'Cabinet',
                 acte: acteLibelle,
                 amount: montant,
                 reglement: reglement,
                 status: status,
                 source: v[9] || 'LogosW',
                 patientId: pId,
                 actsList: []
               };
           }
        });
      }

      const finalData = Object.values(entriesMap).map(entry => {
         if (entry.actsList && entry.actsList.length > 0) {
             entry.acte = entry.actsList.join(' + ');
         }
         if (entry.source === 'Doctolib + LogosW') {
             let status = 'En attente';
             if (entry.reglement >= entry.amount && entry.amount > 0) status = 'Encaissé';
             else if (entry.reglement > 0) status = 'Acompte';
             else if (entry.amount === 0 && entry.reglement > 0) status = 'Encaissé';
             entry.status = status;
         }
         return entry;
      });

      finalData.sort((a, b) => {
         if (a.time === '---') return 1;
         if (b.time === '---') return -1;
         return a.time.localeCompare(b.time);
      });

      setStats({ vus, reglements: reglementsCount });
      setData(finalData);
    } catch (e) {
      console.error(e);
    }
  };

  const loadWeekData = (date: string) => {
    const db = getDB();
    if (!db) return;

    const monday = getMonday(date);
    const days: string[] = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

    try {
      const results: { date: string; vus: number; prod: number; enc: number }[] = [];
      for (const d of days) {
        const rdvRes = db.exec(
          `SELECT COUNT(*) FROM appointments WHERE date = ? AND statut = 'Vu'`, [d]
        );
        const actRes = db.exec(
          `SELECT SUM(montant_acte), SUM(COALESCE(reglement_somme,0)) FROM clinical_acts WHERE date = ? AND montant_acte > 0`, [d]
        );
        const vus = rdvRes.length > 0 && rdvRes[0].values[0] ? Number(rdvRes[0].values[0][0]) || 0 : 0;
        const prod = actRes.length > 0 && actRes[0].values[0] ? Number(actRes[0].values[0][0]) || 0 : 0;
        const enc  = actRes.length > 0 && actRes[0].values[0] ? Number(actRes[0].values[0][1]) || 0 : 0;
        results.push({ date: d, vus, prod, enc });
      }
      setWeekData(results);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRangeChange = (start: Date | null, _end: Date | null) => {
    if (start) {
      const year = start.getFullYear();
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const day = String(start.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
    }
  };

  const weekMax = weekData.reduce((m, d) => Math.max(m, d.prod), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>
        {/* Toggle Jour / Semaine */}
        <div style={{
          display: 'flex',
          background: 'var(--separator-opaque)',
          borderRadius: '8px',
          padding: '2px',
          gap: '2px',
        }}>
          {(['jour', 'semaine'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                height: '28px',
                padding: '0 0.875rem',
                fontSize: '0.75rem',
                fontWeight: 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 150ms',
                background: viewMode === mode ? 'var(--bg-elevated)' : 'transparent',
                color: viewMode === mode ? 'var(--text)' : 'var(--text-tertiary)',
                boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {mode === 'jour' ? 'Jour' : 'Semaine'}
            </button>
          ))}
        </div>
        <DateRangePicker singleDate={true} initialDate={new Date(selectedDate)} onRangeChange={handleRangeChange} />
      </div>

      {viewMode === 'semaine' ? (
        /* ── Vue Semaine ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Semaine label */}
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
            Semaine du {formatShortDate(weekData[0]?.date || getMonday(selectedDate))} au {formatShortDate(weekData[6]?.date || addDays(getMonday(selectedDate), 6))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem' }}>
            {weekData.map((day, i) => {
              const isToday = day.date === _todayISO;
              const isSelected = day.date === selectedDate;
              const barPct = weekMax > 0 ? (day.prod / weekMax) * 100 : 0;
              const hasData = day.prod > 0 || day.vus > 0;
              return (
                <div
                  key={day.date}
                  onClick={() => { setSelectedDate(day.date); setViewMode('jour'); }}
                  style={{
                    background: isSelected ? 'var(--accent)' : 'var(--bg-elevated)',
                    borderRadius: '12px',
                    padding: '1rem 0.75rem',
                    cursor: 'pointer',
                    border: isToday && !isSelected ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                    transition: 'all 150ms',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    opacity: hasData || isToday ? 1 : 0.45,
                  }}
                >
                  {/* Day header */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {DAY_LABELS[i]}
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: isSelected ? '#fff' : 'var(--text)', lineHeight: 1.2, marginTop: '0.15rem' }}>
                      {new Date(day.date + 'T12:00:00').getDate()}
                    </div>
                  </div>

                  {/* Mini bar */}
                  <div style={{ height: '3px', borderRadius: '9999px', background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--separator-opaque)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${barPct}%`,
                      background: isSelected ? '#fff' : 'var(--accent)',
                      borderRadius: '9999px',
                    }} />
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Patients</span>
                      <span style={{ fontWeight: 600 }}>{day.vus}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Prod.</span>
                      <span style={{ fontWeight: 600 }}>
                        {day.prod > 0 ? `${Math.round(day.prod / 1000)}k€` : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--green-text)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Enc.</span>
                      <span style={{ fontWeight: 600 }}>
                        {day.enc > 0 ? `${Math.round(day.enc / 1000)}k€` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weekly totals */}
          {weekData.length > 0 && (
            <div className="kpi-grid" style={{ marginTop: '0.25rem' }}>
              <div className="kpi-card">
                <span className="kpi-label">Patients vus</span>
                <div className="kpi-value">{weekData.reduce((s, d) => s + d.vus, 0)}</div>
                <div className="kpi-hint">Total rendez-vous honorés sur la semaine.</div>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Production semaine</span>
                <div className="kpi-value">{weekData.reduce((s, d) => s + d.prod, 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
                <div className="kpi-hint">Somme des actes facturés sur les 7 jours.</div>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Encaissement semaine</span>
                <div className="kpi-value" style={{ color: 'var(--green-text)' }}>{weekData.reduce((s, d) => s + d.enc, 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
                <div className="kpi-hint">Règlements reçus sur la semaine.</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Vue Jour ── */
        <>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '0.875rem', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%' }}></span>
              <span style={{ fontWeight: 600 }}>Patients vus: {stats.vus}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '0.875rem', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--success)', borderRadius: '50%' }}></span>
              <span style={{ fontWeight: 600 }}>Règlements enregistrés: {stats.reglements}</span>
            </div>
          </div>

          <div className="card" style={{ padding: '0' }}>
            <div className="table-container" style={{ border: 'none', borderRadius: '0.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Heure / Source</th>
                    <th>Patient</th>
                    <th>Praticien</th>
                    <th>Nature</th>
                    <th>Montant Acte</th>
                    <th>Paiement</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.75rem' }}>📅</span>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                            Aucune activité le {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            Aucun acte ni rendez-vous importé pour cette journée. Vérifiez la date ou lancez un import.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    data.map((row, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${row.patientId}`)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{row.time}</span>
                            <span className={`badge ${row.source === 'LogosW' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', backgroundColor: row.source === 'LogosW' ? '#e0e7ff' : '#fef9c3', color: row.source === 'LogosW' ? '#3730a3' : '#a16207' }}>
                              {row.source}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{row.patient}</td>
                        <td>{row.praticien}</td>
                        <td>{row.acte}</td>
                        <td style={{ fontWeight: row.amount > 0 ? 600 : 400, color: row.amount > 0 ? 'var(--warning-text)' : 'inherit' }}>
                          {row.amount > 0 ? `${row.amount.toLocaleString('fr-FR')} €` : '-'}
                        </td>
                        <td style={{ fontWeight: row.reglement > 0 ? 600 : 400, color: row.reglement > 0 ? 'var(--success-text)' : 'inherit' }}>
                          {row.reglement > 0 ? `${row.reglement.toLocaleString('fr-FR')} €` : '-'}
                        </td>
                        <td>
                          {row.type_row === 'rdv' ? (
                            <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>{row.status}</span>
                          ) : (
                            <span className={`badge ${row.status === 'Encaissé' ? 'badge-success' : row.status === 'En attente' ? 'badge-warning' : 'badge-info'}`}>
                              {row.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
