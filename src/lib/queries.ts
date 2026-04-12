import { getDB } from './db';

export interface DashboardStats {
  totalPatients: number;
  totalCA: number;
  unbilledCount: number;
  periodLabel: string;
}

export const getDashboardStats = (startDate?: string, endDate?: string): DashboardStats => {
  const db = getDB();
  if (!db) return { totalPatients: 0, totalCA: 0, unbilledCount: 0, periodLabel: 'Aucune donnée' };

  let dateFilter = "";
  if (startDate && endDate) {
    dateFilter = `AND date BETWEEN '${startDate}' AND '${endDate}'`;
  }

  const res = db.exec(`
    SELECT 
      (SELECT COUNT(*) FROM appointments WHERE statut = 'Vu' ${dateFilter}) as patients,
      (SELECT SUM(montant) FROM clinical_acts WHERE 1=1 ${dateFilter}) as ca,
      (SELECT COUNT(*) FROM (
        SELECT a.id FROM appointments a
        LEFT JOIN clinical_acts ca ON a.patient_id = ca.patient_id AND a.date = ca.date
        WHERE a.statut = 'Vu' AND ca.id IS NULL ${dateFilter}
      )) as unbilled
  `);

  if (res.length > 0) {
    const [patients, ca, unbilled] = res[0].values[0];
    return {
      totalPatients: Number(patients) || 0,
      totalCA: Number(ca) || 0,
      unbilledCount: Number(unbilled) || 0,
      periodLabel: startDate ? `${startDate} au ${endDate}` : 'Toutes données'
    };
  }

  return { totalPatients: 0, totalCA: 0, unbilledCount: 0, periodLabel: 'Erreur SQL' };
};

export const getPractitionerPerformance = (startDate?: string, endDate?: string) => {
  const db = getDB();
  if (!db) return [];

  let dateFilter = "";
  if (startDate && endDate) {
    dateFilter = `AND date BETWEEN '${startDate}' AND '${endDate}'`;
  }

  const res = db.exec(`
    SELECT praticien, COUNT(*) as patients, SUM(montant) as ca
    FROM (
      SELECT a.praticien, ca.montant
      FROM appointments a
      JOIN clinical_acts ca ON a.patient_id = ca.patient_id AND a.date = ca.date
      WHERE a.statut = 'Vu' ${dateFilter}
    )
    GROUP BY praticien
    ORDER BY ca DESC
  `);

  if (res.length > 0) {
    return res[0].values.map(v => ({
      name: String(v[0]),
      patients: Number(v[1]),
      revenus: Number(v[2])
    }));
  }
  return [];
};
