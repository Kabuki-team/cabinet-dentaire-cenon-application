import type { FastifyInstance } from 'fastify';
import { bumpVersion, type DbHolder } from '../db.js';

type SqlParamValue = string | number | boolean | null | Uint8Array | Buffer;

interface SqlStatement {
  sql: string;
  params?: SqlParamValue[];
}

interface ExecBody {
  statements: SqlStatement[];
}

interface QueryBody {
  sql: string;
  params?: SqlParamValue[];
}

interface ExecStatementResult {
  changes: number;
  lastInsertRowid: number | string;
}

// Mots-clés dangereux bloqués côté serveur (Phase 1 : endpoint SQL ouvert mais brideé).
// En Phase 2, cet endpoint sera remplacé par des routes REST spécifiques et supprimé.
const FORBIDDEN_PATTERNS = [
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bVACUUM\b/i,
  /\bload_extension\b/i,
  /\bPRAGMA\s+(journal_mode|synchronous|foreign_keys|locking_mode|schema_version|user_version)\b/i,
  /\bDROP\s+DATABASE\b/i,
];

// Ne bloque pas DROP TABLE (utile pour les migrations locales) mais log un warning.
function isForbidden(sql: string): string | null {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sql)) {
      return pattern.source;
    }
  }
  return null;
}

function normalizeParams(params: unknown): SqlParamValue[] {
  if (params === undefined || params === null) return [];
  if (!Array.isArray(params)) {
    throw new Error('params doit être un tableau');
  }
  return params.map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (v instanceof Uint8Array) return v;
    if (typeof v === 'object' && 'type' in (v as object) && (v as { type: string }).type === 'Buffer') {
      return Buffer.from((v as { data: number[] }).data);
    }
    throw new Error(`Type de paramètre non supporté : ${typeof v}`);
  });
}

export function registerSqlRoutes(app: FastifyInstance, holder: DbHolder) {
  // Exécute une ou plusieurs instructions d'écriture dans une transaction atomique.
  // Incrémente db_version une seule fois pour l'ensemble du batch.
  app.post<{ Body: ExecBody }>('/api/sql/exec', async (request, reply) => {
    const db = holder.db;
    const body = request.body;
    if (!body || !Array.isArray(body.statements) || body.statements.length === 0) {
      return reply.code(400).send({ error: 'body.statements requis (array non vide)' });
    }

    for (const stmt of body.statements) {
      if (typeof stmt.sql !== 'string' || stmt.sql.trim() === '') {
        return reply.code(400).send({ error: 'chaque statement doit avoir un champ sql non vide' });
      }
      const forbidden = isForbidden(stmt.sql);
      if (forbidden) {
        request.log.warn({ sql: stmt.sql, forbidden }, 'SQL bloqué par whitelist');
        return reply.code(403).send({ error: 'sql interdit', pattern: forbidden });
      }
    }

    try {
      const results: ExecStatementResult[] = [];
      const runAll = db.transaction((statements: SqlStatement[]) => {
        for (const stmt of statements) {
          const prepared = db.prepare(stmt.sql);
          const info = prepared.run(...normalizeParams(stmt.params));
          results.push({
            changes: info.changes,
            lastInsertRowid:
              typeof info.lastInsertRowid === 'bigint'
                ? Number(info.lastInsertRowid)
                : info.lastInsertRowid,
          });
        }
      });
      runAll(body.statements);

      const version = bumpVersion(db);
      return { ...version, results };
    } catch (err) {
      request.log.error({ err }, 'Erreur lors de l\'exécution SQL');
      return reply
        .code(400)
        .send({ error: 'sql_error', message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Exécute une requête SELECT et retourne les résultats au format sql.js : { columns, values }[].
  // Vide en Phase 1 (les lectures restent locales sur snapshot), mais fourni pour tests et usage futur.
  app.post<{ Body: QueryBody }>('/api/sql/query', async (request, reply) => {
    const db = holder.db;
    const body = request.body;
    if (!body || typeof body.sql !== 'string' || body.sql.trim() === '') {
      return reply.code(400).send({ error: 'body.sql requis' });
    }
    const forbidden = isForbidden(body.sql);
    if (forbidden) {
      return reply.code(403).send({ error: 'sql interdit', pattern: forbidden });
    }

    try {
      const prepared = db.prepare(body.sql);
      const rows = prepared.all(...normalizeParams(body.params)) as Record<string, unknown>[];
      if (rows.length === 0) {
        return { columns: prepared.columns().map((c) => c.name), values: [] };
      }
      const columns = Object.keys(rows[0] ?? {});
      const values = rows.map((row) => columns.map((c) => row[c] ?? null));
      return { columns, values };
    } catch (err) {
      request.log.error({ err }, 'Erreur lors de la requête SELECT');
      return reply
        .code(400)
        .send({ error: 'sql_error', message: err instanceof Error ? err.message : String(err) });
    }
  });
}
