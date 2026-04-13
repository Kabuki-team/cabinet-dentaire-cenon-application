import initSqlJs, { type Database } from 'sql.js';

let db: Database | null = null;
const SQL_WASM_URL = '/sql-wasm.wasm';

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DentalDashboardDB', 2);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    request.onsuccess = (e: any) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('files')) {
         reject(new Error("Storage corrupted"));
         return;
      }
      const transaction = idb.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const putRequest = store.put(data, 'sqlite_db');
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DentalDashboardDB', 2);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    request.onsuccess = (e: any) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('files')) {
         resolve(null);
         return;
      }
      const transaction = idb.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const getRequest = store.get('sqlite_db');
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export const initDB = async () => {
  if (db) return db;
  const SQL = await initSqlJs({ locateFile: () => SQL_WASM_URL });
  const savedData = await loadFromIndexedDB();
  db = savedData ? new SQL.Database(new Uint8Array(savedData)) : new SQL.Database();

  db.run(`
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
        FOREIGN KEY(patient_id) REFERENCES patients(id)
    );
     CREATE TABLE IF NOT EXISTS import_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        source TEXT,
        record_count INTEGER,
        total_prod DECIMAL(10,2),
        total_enc DECIMAL(10,2)
    );
  `);

  try {
    db.run(`ALTER TABLE clinical_acts ADD COLUMN logosw_praticien TEXT;`);
  } catch (e) {
    // Column already exists, safe to ignore
  }

  try {
    db.run(`ALTER TABLE clinical_acts ADD COLUMN import_id TEXT;`);
    db.run(`ALTER TABLE appointments ADD COLUMN import_id TEXT;`);
    db.run(`ALTER TABLE import_logs ADD COLUMN import_id TEXT;`);
  } catch (e) {
    // Columns already exist
  }

  try {
    db.run(`ALTER TABLE import_logs ADD COLUMN anomalies_json TEXT;`);
  } catch (e) {
  }

  try {
    db.run(`ALTER TABLE patients ADD COLUMN nom_doctolib TEXT;`);
    db.run(`ALTER TABLE patients ADD COLUMN nom_logosw TEXT;`);
    db.run(`ALTER TABLE patients ADD COLUMN dossier_logosw TEXT;`);
    db.run(`ALTER TABLE patients ADD COLUMN has_warning BOOLEAN DEFAULT 0;`);
  } catch (e) {}

  try {
    const res = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='clinical_acts'");
    if (res.length > 0 && String(res[0].values[0][0]).includes('UNIQUE')) {
       db.run("CREATE TABLE clinical_acts_new (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER, date TEXT, libelle TEXT, montant_acte DECIMAL(10,2), reglement_somme DECIMAL(10,2), type TEXT, source TEXT, FOREIGN KEY(patient_id) REFERENCES patients(id))");
       db.run("INSERT INTO clinical_acts_new SELECT id, patient_id, date, libelle, montant_acte, reglement_somme, type, source FROM clinical_acts");
       db.run("DROP TABLE clinical_acts");
       db.run("ALTER TABLE clinical_acts_new RENAME TO clinical_acts");
    }
  } catch (e) { console.warn("Schema fix notice:", e); }

  db.run(`
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
  `);

  await saveDB();
  return db;
};

export const getDB = () => db;

export const saveDB = async () => {
  if (db) {
    const data = db.export();
    await saveToIndexedDB(data);
  }
};
