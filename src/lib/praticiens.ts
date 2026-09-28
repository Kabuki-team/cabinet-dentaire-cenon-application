/**
 * Correspondance praticiens et règle d'attribution des écritures financières.
 *
 * LogosW étiquette ses actes avec des initiales ("RM"), Doctolib avec le nom complet
 * de l'agenda ("Dr. Réda Mechouk"). Ce module est la seule copie utilisée par Dashboard
 * et PraticienDetail ; Activity, Revenues et PatientDetail portent encore leur propre
 * copie de la table (cf. CLAUDE.md).
 */

export const MAP_PRATICIENS: Record<string, string> = {
  "RM": "Dr. Réda Mechouk",
  "MF": "Dr. Medy Fakreldin",
  "HG": "Dr. Hamza Gafsi",
  "JL": "Dr. Jean Laborde Barbanegre",
  "MFr": "Dr. Benoit Say-Liang-Fat",
  "RMr": "Dr. Benoit Say-Liang-Fat",
  "RMe": "Etudiant non Thèsé",
  "MFe": "Etudiant non Thèsé",
};

/** Un nom complet peut correspondre à plusieurs jeux d'initiales (remplaçants, étudiants). */
export function initialesDe(nomComplet: string): string[] {
  return Object.entries(MAP_PRATICIENS)
    .filter(([, nom]) => nom === nomComplet)
    .map(([code]) => code);
}

/**
 * Attribution d'une écriture financière (alias `c`) à un praticien : initiales LogosW
 * si elles sont renseignées, sinon le praticien du rendez-vous de même patient et date.
 * Identique à la règle du graphe « Honoraires par praticien » du dashboard.
 */
export const ATTRIBUTION_SQL = `
  CASE WHEN c.logosw_praticien IS NOT NULL AND c.logosw_praticien != 'NC'
       THEN c.logosw_praticien
       ELSE (SELECT a.praticien FROM appointments a
             WHERE a.patient_id = c.patient_id AND a.date = c.date LIMIT 1)
  END`;

export interface PraticienStats {
  patients: number;
  consults: number;
  rdvTotal: number;
  absences: number;
  prod: number;
  enc: number;
  rows: {
    patientId: number;
    patientName: string;
    nbConsult: number;
    date: string;
    dateISO: string;
    prod: number;
    enc: number;
  }[];
  actes: { libelle: string; nb: number; prod: number }[];
  months: { label: string; prod: number; enc: number }[];
}

export const EMPTY_STATS: PraticienStats = {
  patients: 0, consults: 0, rdvTotal: 0, absences: 0, prod: 0, enc: 0,
  rows: [], actes: [], months: [],
};

/** URL de la fiche praticien, période courante conservée en query string. */
export function praticienUrl(nom: string, start: Date | null, end: Date | null): string {
  const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const qs = start && end ? `?debut=${iso(start)}&fin=${iso(end)}` : '';
  return `/praticiens/${encodeURIComponent(nom)}${qs}`;
}
