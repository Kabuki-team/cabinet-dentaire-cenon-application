import { getDB, saveDB } from './db';

export type AdjustmentType = 'ACTE' | 'REGLEMENT';

export interface ManualAdjustment {
  id: number;
  patient_id: number;
  date: string;
  libelle: string;
  montant_acte: number;
  reglement_somme: number;
  type: AdjustmentType;
  comment: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AdjustmentInput {
  patient_id: number;
  date: string;
  libelle: string;
  type: AdjustmentType;
  montant_acte?: number;
  reglement_somme?: number;
  comment?: string;
}

function rowToAdjustment(row: any[]): ManualAdjustment {
  return {
    id: Number(row[0]),
    patient_id: Number(row[1]),
    date: String(row[2]),
    libelle: String(row[3] ?? ''),
    montant_acte: Number(row[4]) || 0,
    reglement_somme: Number(row[5]) || 0,
    type: (row[6] as AdjustmentType) || 'ACTE',
    comment: row[7] ? String(row[7]) : null,
    created_at: String(row[8]),
    updated_at: String(row[9]),
    deleted_at: row[10] ? String(row[10]) : null,
  };
}

const SELECT_COLS =
  'id, patient_id, date, libelle, montant_acte, reglement_somme, type, comment, created_at, updated_at, deleted_at';

export function listAdjustments(patientId: number, includeDeleted = false): ManualAdjustment[] {
  const db = getDB();
  if (!db) return [];
  const where = includeDeleted
    ? 'WHERE patient_id = ?'
    : 'WHERE patient_id = ? AND deleted_at IS NULL';
  const res = db.exec(
    `SELECT ${SELECT_COLS} FROM manual_adjustments ${where} ORDER BY date DESC, created_at DESC`,
    [patientId]
  );
  if (res.length === 0) return [];
  return res[0].values.map(rowToAdjustment);
}

export function getAdjustment(id: number): ManualAdjustment | null {
  const db = getDB();
  if (!db) return null;
  const res = db.exec(`SELECT ${SELECT_COLS} FROM manual_adjustments WHERE id = ?`, [id]);
  if (res.length === 0 || res[0].values.length === 0) return null;
  return rowToAdjustment(res[0].values[0]);
}

export async function createAdjustment(input: AdjustmentInput): Promise<number | null> {
  const db = getDB();
  if (!db) return null;
  const montant = input.type === 'ACTE' ? input.montant_acte ?? 0 : 0;
  const reglement = input.type === 'REGLEMENT' ? input.reglement_somme ?? 0 : 0;
  db.run(
    `INSERT INTO manual_adjustments (patient_id, date, libelle, montant_acte, reglement_somme, type, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.patient_id,
      input.date,
      input.libelle,
      montant,
      reglement,
      input.type,
      input.comment ?? null,
    ]
  );
  const idRes = db.exec('SELECT last_insert_rowid()');
  const newId =
    idRes.length > 0 && idRes[0].values[0] ? Number(idRes[0].values[0][0]) : null;
  await saveDB();
  return newId;
}

export async function updateAdjustment(id: number, input: AdjustmentInput): Promise<void> {
  const db = getDB();
  if (!db) return;
  const montant = input.type === 'ACTE' ? input.montant_acte ?? 0 : 0;
  const reglement = input.type === 'REGLEMENT' ? input.reglement_somme ?? 0 : 0;
  db.run(
    `UPDATE manual_adjustments
     SET date = ?, libelle = ?, montant_acte = ?, reglement_somme = ?, type = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [input.date, input.libelle, montant, reglement, input.type, input.comment ?? null, id]
  );
  await saveDB();
}

export async function softDeleteAdjustment(id: number): Promise<void> {
  const db = getDB();
  if (!db) return;
  db.run(
    `UPDATE manual_adjustments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  await saveDB();
}

export async function restoreAdjustment(id: number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const adj = getAdjustment(id);
  if (!adj) return false;
  // Vérifie que le patient existe toujours avant restauration.
  const pRes = db.exec('SELECT id FROM patients WHERE id = ?', [adj.patient_id]);
  if (pRes.length === 0 || pRes[0].values.length === 0) return false;
  db.run(`UPDATE manual_adjustments SET deleted_at = NULL WHERE id = ?`, [id]);
  await saveDB();
  return true;
}
