import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctolib_id TEXT UNIQUE,
    civilite TEXT,
    nom TEXT,
    prenom TEXT,
    nom_complet_norm TEXT,
    nom_naissance TEXT,
    date_naissance TEXT,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    code_postal TEXT,
    ville TEXT,
    nom_doctolib TEXT,
    nom_logosw TEXT,
    dossier_logosw TEXT,
    has_warning BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_uid TEXT UNIQUE,
    patient_id INTEGER,
    date TEXT,
    heure TEXT,
    praticien TEXT,
    motif TEXT,
    statut TEXT,
    import_id TEXT,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS clinical_acts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    date TEXT,
    libelle TEXT,
    montant_acte DECIMAL(10,2),
    reglement_somme DECIMAL(10,2),
    type TEXT,
    source TEXT,
    logosw_praticien TEXT,
    cotation TEXT,
    dents TEXT,
    import_id TEXT,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    record_count INTEGER,
    total_prod DECIMAL(10,2),
    total_enc DECIMAL(10,2),
    import_id TEXT,
    anomalies_json TEXT
);

CREATE TABLE IF NOT EXISTS patient_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    date_rendez_vous TEXT,
    is_dismissed BOOLEAN DEFAULT 0,
    comment TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id),
    UNIQUE(patient_id, date_rendez_vous)
);

CREATE TABLE IF NOT EXISTS logosw_dictionary (
    dossier_id TEXT PRIMARY KEY,
    nom TEXT,
    prenom TEXT,
    nom_complet_norm TEXT,
    date_naissance TEXT
);

CREATE TABLE IF NOT EXISTS patient_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS manual_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    libelle TEXT NOT NULL,
    montant_acte DECIMAL(10,2) DEFAULT 0,
    reglement_somme DECIMAL(10,2) DEFAULT 0,
    type TEXT,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS _meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

DROP VIEW IF EXISTS financial_entries;
CREATE VIEW financial_entries AS
  SELECT
    id, patient_id, date, libelle,
    COALESCE(montant_acte, 0) as montant_acte,
    COALESCE(reglement_somme, 0) as reglement_somme,
    type, source, logosw_praticien,
    cotation, dents,
    0 as is_manual,
    NULL as comment,
    NULL as created_at,
    NULL as updated_at
  FROM clinical_acts
  UNION ALL
  SELECT
    id, patient_id, date, libelle,
    COALESCE(montant_acte, 0) as montant_acte,
    COALESCE(reglement_somme, 0) as reglement_somme,
    type,
    'MANUAL' as source,
    NULL as logosw_praticien,
    NULL as cotation,
    NULL as dents,
    1 as is_manual,
    comment,
    created_at,
    updated_at
  FROM manual_adjustments
  WHERE deleted_at IS NULL;
`;

export type DB = Database.Database;

// Holder vivant : toutes les routes lisent `holder.db` à chaque appel, donc un `reopen()`
// est visible immédiatement sans avoir à ré-enregistrer les routes.
export interface DbHolder {
  db: DB;
}

export function openDatabase(dbPath: string): DB {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);

  const existing = db
    .prepare('SELECT value FROM _meta WHERE key = ?')
    .get('db_version') as { value: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?)').run('db_version', '0');
  }
  const existingUpdated = db
    .prepare('SELECT value FROM _meta WHERE key = ?')
    .get('updated_at') as { value: string } | undefined;
  if (!existingUpdated) {
    db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?)').run(
      'updated_at',
      new Date().toISOString(),
    );
  }

  return db;
}

export function getVersion(db: DB): { version: number; updatedAt: string } {
  const versionRow = db.prepare('SELECT value FROM _meta WHERE key = ?').get('db_version') as
    | { value: string }
    | undefined;
  const updatedRow = db.prepare('SELECT value FROM _meta WHERE key = ?').get('updated_at') as
    | { value: string }
    | undefined;
  return {
    version: Number.parseInt(versionRow?.value ?? '0', 10),
    updatedAt: updatedRow?.value ?? new Date(0).toISOString(),
  };
}

export function bumpVersion(db: DB): { version: number; updatedAt: string } {
  const now = new Date().toISOString();
  const update = db.transaction(() => {
    const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('db_version') as
      | { value: string }
      | undefined;
    const next = Number.parseInt(row?.value ?? '0', 10) + 1;
    db.prepare('UPDATE _meta SET value = ? WHERE key = ?').run(String(next), 'db_version');
    db.prepare('UPDATE _meta SET value = ? WHERE key = ?').run(now, 'updated_at');
    return next;
  });
  const version = update();
  return { version, updatedAt: now };
}
