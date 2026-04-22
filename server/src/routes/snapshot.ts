import type { FastifyInstance } from 'fastify';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bumpVersion, getVersion, openDatabase, type DbHolder } from '../db.js';

const SQLITE_MAGIC = 'SQLite format 3';

interface SnapshotDeps extends DbHolder {
  dbPath: string;
}

export function registerSnapshotRoutes(app: FastifyInstance, deps: SnapshotDeps) {
  // Version cheap pour le polling côté clients (15s).
  app.get('/api/db/version', async () => getVersion(deps.db));

  // Télécharge la base SQLite complète. better-sqlite3 expose `db.serialize()` qui produit
  // un buffer consistant sans bloquer les écritures concurrentes (snapshot WAL).
  app.get('/api/db/snapshot', async (_request, reply) => {
    const buffer = deps.db.serialize();
    const { version, updatedAt } = getVersion(deps.db);
    reply
      .header('Content-Type', 'application/vnd.sqlite3')
      .header('Content-Disposition', 'attachment; filename="cenon.db"')
      .header('X-DB-Version', String(version))
      .header('X-DB-Updated-At', updatedAt);
    return reply.send(buffer);
  });

  // Upload one-shot : remplace la base serveur par un fichier SQLite envoyé par le client.
  // Utile pour la migration initiale depuis l'IndexedDB Tauri existant.
  // Envoyer avec Content-Type: application/octet-stream + header X-Confirm-Replace: yes.
  app.post('/api/db/upload', async (request, reply) => {
    if (request.headers['x-confirm-replace'] !== 'yes') {
      return reply.code(412).send({
        error: 'confirmation_requise',
        message: 'Ajouter le header "X-Confirm-Replace: yes" pour confirmer le remplacement.',
      });
    }

    const payload = request.body;
    if (!Buffer.isBuffer(payload)) {
      return reply.code(400).send({
        error: 'invalid_body',
        message:
          'Le body doit être envoyé avec Content-Type: application/octet-stream (buffer binaire).',
      });
    }
    if (
      payload.length < SQLITE_MAGIC.length + 1 ||
      payload.subarray(0, SQLITE_MAGIC.length).toString('ascii') !== SQLITE_MAGIC
    ) {
      return reply
        .code(400)
        .send({ error: 'invalid_sqlite', message: 'Le fichier ne ressemble pas à une base SQLite.' });
    }

    const tempPath = join(tmpdir(), `cenon-upload-${randomUUID()}.db`);
    await writeFile(tempPath, payload);

    deps.db.close();
    try {
      await rename(tempPath, deps.dbPath);
    } catch {
      // Sur Windows, rename cross-device peut échouer → fallback copy.
      const copyBuf = await readFile(tempPath);
      await writeFile(deps.dbPath, copyBuf);
    }
    deps.db = openDatabase(deps.dbPath);
    const version = bumpVersion(deps.db);

    request.log.info({ bytes: payload.length, version: version.version }, 'DB remplacée par upload');
    return { ok: true, bytes: payload.length, ...version };
  });
}
