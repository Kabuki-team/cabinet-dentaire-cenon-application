import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { config } from './config';
import {
  BackendUnreachableError,
  execStatements,
  fetchServerVersion,
  fetchSnapshot,
  type SqlStatement,
} from './serverSync';

// Phase 1 : la DB serveur (better-sqlite3 côté Node) fait autorité. Côté client on garde
// une instance sql.js hydratée depuis /api/db/snapshot pour les lectures locales rapides.
// Les écritures sont capturées puis flushées au serveur via /api/sql/exec à chaque saveDB().
// Polling 15s sur /api/db/version pour détecter les mutations venant d'autres postes.

const SQL_WASM_URL = '/sql-wasm.wasm';
const INDEXEDDB_NAME = 'DentalDashboardDB';
const INDEXEDDB_VERSION = 2;
const INDEXEDDB_KEY = 'sqlite_db';

interface PendingStatement {
  sql: string;
  params: unknown[];
}

const holder: { db: Database | null; sqlJs: SqlJsStatic | null } = {
  db: null,
  sqlJs: null,
};
let pendingStatements: PendingStatement[] = [];
let lastKnownServerVersion = 0;
let pollTimer: number | null = null;
let offlineMode = false;
let initPromise: Promise<Database> | null = null;

// ---- Offline fallback (IndexedDB) ---------------------------------------------------

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
    request.onupgradeneeded = (e) => {
      const idb = (e.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains('files')) idb.createObjectStore('files');
    };
    request.onsuccess = (e) => {
      const idb = (e.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains('files')) {
        reject(new Error('Storage corrupted'));
        return;
      }
      const transaction = idb.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const putRequest = store.put(data, INDEXEDDB_KEY);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
    request.onupgradeneeded = (e) => {
      const idb = (e.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains('files')) idb.createObjectStore('files');
    };
    request.onsuccess = (e) => {
      const idb = (e.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains('files')) {
        resolve(null);
        return;
      }
      const transaction = idb.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const getRequest = store.get(INDEXEDDB_KEY);
      getRequest.onsuccess = () => resolve(getRequest.result ?? null);
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// ---- Classification des statements ---------------------------------------------------

const WRITE_RE = /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
const TX_RE = /^(BEGIN|COMMIT|ROLLBACK|END)\b/i;

function firstKeyword(sql: string): string {
  const stripped = sql.replace(/^(\s|--[^\n]*\n?)+/g, '');
  return stripped;
}

function classify(sql: string): 'write' | 'transaction' | 'other' {
  const head = firstKeyword(sql);
  if (TX_RE.test(head)) return 'transaction';
  if (WRITE_RE.test(head)) return 'write';
  return 'other';
}

// ---- Événements -----------------------------------------------------------------------

type DbEventName = 'db-updated' | 'db-offline' | 'db-online';

function dispatch(name: DbEventName, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function setOffline(value: boolean) {
  if (offlineMode === value) return;
  offlineMode = value;
  dispatch(value ? 'db-offline' : 'db-online');
}

export function isOffline(): boolean {
  return offlineMode;
}

// ---- Proxy ---------------------------------------------------------------------------

// Proxy stable exposé par getDB(). Chaque appel lit holder.db (swappé lors de replaceLocalDb),
// ce qui permet aux composants qui ont stocké `const db = getDB()` de voir la DB courante
// même après un refetch de snapshot.
const proxyDb: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const db = holder.db;
    if (!db) {
      throw new Error("Base non initialisée — appeler initDB() avant d'utiliser getDB().");
    }

    if (prop === 'run') {
      return function proxyRun(sql: string, params?: unknown[]) {
        const type = classify(sql);
        const runFn = db.run as (sql: string, params?: unknown[]) => Database;
        const result = params !== undefined ? runFn.call(db, sql, params) : runFn.call(db, sql);
        if (type === 'write') {
          pendingStatements.push({ sql, params: (params as unknown[]) ?? [] });
        }
        return result;
      };
    }

    if (prop === 'exec') {
      return function proxyExec(sql: string, params?: unknown[]) {
        const type = classify(sql);
        const execFn = db.exec as (sql: string, params?: unknown[]) => unknown;
        const result =
          params !== undefined ? execFn.call(db, sql, params) : execFn.call(db, sql);
        if (type === 'write') {
          pendingStatements.push({ sql, params: (params as unknown[]) ?? [] });
        }
        return result;
      };
    }

    const value = (db as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(db) : value;
  },
});

function replaceLocalDb(snapshot: Uint8Array) {
  if (!holder.sqlJs) {
    throw new Error('sql.js non initialisé');
  }
  if (holder.db) {
    try {
      holder.db.close();
    } catch {
      /* ignore */
    }
  }
  holder.db = new holder.sqlJs.Database(snapshot);
}

// ---- Polling -------------------------------------------------------------------------

function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(() => {
    void pollOnce();
  }, config.pollIntervalMs);
}

export function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollOnce() {
  try {
    const { version } = await fetchServerVersion();
    setOffline(false);
    if (version > lastKnownServerVersion && pendingStatements.length === 0) {
      const snapshot = await fetchSnapshot();
      replaceLocalDb(snapshot);
      await saveToIndexedDB(snapshot);
      lastKnownServerVersion = version;
      dispatch('db-updated', { version, source: 'poll' });
    }
  } catch (err) {
    if (err instanceof BackendUnreachableError) {
      setOffline(true);
    } else {
      console.warn('[db] Polling échoué:', err);
    }
  }
}

// ---- API publique --------------------------------------------------------------------

export const initDB = async (): Promise<Database> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!holder.sqlJs) {
      holder.sqlJs = await initSqlJs({ locateFile: () => SQL_WASM_URL });
    }

    let snapshot: Uint8Array | null = null;
    let fromServer = false;
    try {
      snapshot = await fetchSnapshot();
      fromServer = true;
      setOffline(false);
    } catch (err) {
      console.warn('[db] Snapshot serveur indisponible, fallback IndexedDB:', err);
      setOffline(true);
      const fallback = await loadFromIndexedDB();
      if (fallback) snapshot = new Uint8Array(fallback);
    }

    if (!snapshot) {
      throw new Error(
        'Impossible de récupérer la base : serveur injoignable et aucun cache local. ' +
          'Vérifier la connexion au serveur cabinet et réessayer.',
      );
    }

    replaceLocalDb(snapshot);
    if (fromServer) {
      await saveToIndexedDB(snapshot).catch((err) => {
        console.warn('[db] Cache IndexedDB non mis à jour:', err);
      });
    }

    try {
      lastKnownServerVersion = (await fetchServerVersion()).version;
    } catch {
      /* déjà en mode offline */
    }

    startPolling();
    return proxyDb;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
};

export const getDB = (): Database | null => (holder.db ? proxyDb : null);

export const saveDB = async (): Promise<void> => {
  if (!holder.db) return;

  const batch: SqlStatement[] = pendingStatements
    .filter((s) => classify(s.sql) === 'write')
    .map((s) => ({ sql: s.sql, params: s.params }));
  pendingStatements = [];

  if (batch.length === 0) {
    // Pas de mutation à pousser : persister juste le cache IndexedDB pour le fallback offline.
    try {
      await saveToIndexedDB(holder.db.export());
    } catch (err) {
      console.warn('[db] Cache IndexedDB non mis à jour:', err);
    }
    return;
  }

  try {
    const result = await execStatements(batch);
    setOffline(false);
    lastKnownServerVersion = result.version;

    // Re-fetch du snapshot : les valeurs générées côté serveur (autoincrement, CURRENT_TIMESTAMP)
    // peuvent différer de la simulation locale. Refetch = alignement parfait.
    const fresh = await fetchSnapshot();
    replaceLocalDb(fresh);
    await saveToIndexedDB(fresh).catch((err) => {
      console.warn('[db] Cache IndexedDB non mis à jour:', err);
    });
    dispatch('db-updated', { version: result.version, source: 'save' });
  } catch (err) {
    // Remettre les statements en attente pour retry au prochain saveDB()
    pendingStatements = [...batch, ...pendingStatements];
    if (err instanceof BackendUnreachableError) {
      setOffline(true);
    }
    throw err;
  }
};

export function pendingWriteCount(): number {
  return pendingStatements.length;
}
