import { useState, useEffect } from 'react';
import { Filter, Download, UserCircle, CheckCircle } from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { getDB } from '../lib/db';
import { useNavigate } from 'react-router-dom';

export function Activity() {
  const [selectedDate, setSelectedDate] = useState<string>('2026-03-24'); // On initialise à une date par défaut ou vide
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState({ vus: 0, reglements: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  const loadData = (date: string) => {
    const db = getDB();
    if (!db || !date) return;

    try {
      // Pour une journée, on va chercher à la fois les Actes et les Rendez-vous pour reconstruire le journal
      // 1. Chercher les Actes & Règlements
      const actesRes = db.exec(`
        SELECT 
          ca.id, ca.date, p.nom, p.prenom, ca.logosw_praticien, ca.libelle, ca.montant_acte, ca.reglement_somme, ca.type, ca.source, p.id as pId
        FROM clinical_acts ca
        JOIN patients p ON ca.patient_id = p.id
        WHERE ca.date = ?
      `, [date]);

      // 2. Chercher les RDV sans actes (pour voir l'agenda complet)
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
        "RMe": "Dr. RMe (Dr Réda Mechouk externe ?)",
        "RMr": "Dr. RMr (Dr Réda Mechouk remplaçant ?)"
      };

      // Map RDV
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

      // Map Actes 
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
               if (logosP) entriesMap[pId].praticien = logosP; // LogosW override
           } else {
               let status = 'En attente';
               if (reglement >= montant && montant > 0) status = 'Encaissé';
               else if (reglement > 0) status = 'Acompte';
               else if (v[8] === 'REGLEMENT') status = 'Encaissé';

               entriesMap[`logos_${v[0]}`] = {
                 type_row: 'acte',
                 time: '---', // LogosW export doesn't have reliable time usually
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

      // Sort by time (putting --- at the end)
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

  const handleRangeChange = (start: Date | null, end: Date | null) => {
    if (start) {
      const year = start.getFullYear();
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const day = String(start.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Activité quotidienne</h1>
          <p style={{ color: 'var(--text-muted)' }}>Le journal précis des actes et paiements du jour.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <DateRangePicker singleDate={true} initialDate={new Date(selectedDate)} onRangeChange={handleRangeChange} />
          <button className="btn btn-primary" style={{ backgroundColor: 'white', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <Filter size={18} /> Filtres
          </button>
          <button className="btn btn-outline"><Download size={18} /> Export CSV</button>
        </div>
      </div>
      
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
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Aucune donnée trouvée pour cette journée.
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
    </div>
  );
}
