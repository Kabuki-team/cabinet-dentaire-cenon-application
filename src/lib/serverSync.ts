import { apiUrl, config } from './config';

export interface ServerVersion {
  version: number;
  updatedAt: string;
}

export interface SqlStatement {
  sql: string;
  params: unknown[];
}

export interface ExecResult {
  version: number;
  updatedAt: string;
  results: { changes: number; lastInsertRowid: number | string }[];
}

export class BackendUnreachableError extends Error {
  readonly networkCause: unknown;
  constructor(message: string, networkCause?: unknown) {
    super(message);
    this.name = 'BackendUnreachableError';
    this.networkCause = networkCause;
  }
}

function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    'X-Office-Token': config.officeToken,
    ...extra,
  };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(apiUrl(path), init);
    if (response.status === 401) {
      throw new Error("Authentification refusée (X-Office-Token invalide ou manquant).");
    }
    return response;
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch TypeError = réseau injoignable / DNS / CORS
      throw new BackendUnreachableError(
        `Serveur cabinet injoignable (${apiUrl(path)})`,
        err,
      );
    }
    throw err;
  }
}

export async function fetchServerVersion(): Promise<ServerVersion> {
  const res = await apiFetch('/api/db/version', {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`fetchServerVersion: HTTP ${res.status}`);
  }
  return (await res.json()) as ServerVersion;
}

export async function fetchSnapshot(): Promise<Uint8Array> {
  const res = await apiFetch('/api/db/snapshot', {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`fetchSnapshot: HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function uploadSnapshot(data: Uint8Array): Promise<ServerVersion> {
  const res = await apiFetch('/api/db/upload', {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/octet-stream',
      'X-Confirm-Replace': 'yes',
    }),
    body: new Blob([new Uint8Array(data)], { type: 'application/octet-stream' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`uploadSnapshot: HTTP ${res.status} ${text}`);
  }
  const json = (await res.json()) as ServerVersion;
  return json;
}

export async function execStatements(statements: SqlStatement[]): Promise<ExecResult> {
  if (statements.length === 0) {
    const version = await fetchServerVersion();
    return { ...version, results: [] };
  }
  const res = await apiFetch('/api/sql/exec', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ statements }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`execStatements: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as ExecResult;
}
