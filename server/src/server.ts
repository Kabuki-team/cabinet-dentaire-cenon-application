import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { openDatabase, type DbHolder } from './db.js';
import { makeAuthHook } from './auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSqlRoutes } from './routes/sql.js';
import { registerSnapshotRoutes } from './routes/snapshot.js';

async function main() {
  const config = loadConfig();

  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 250 * 1024 * 1024, // 250 Mo max — couvre largement le POST /api/db/upload
    trustProxy: false,
  });

  // Parseur binaire pour /api/db/upload : accumule le stream en Buffer.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  const holder: DbHolder = { db: openDatabase(config.dbPath) };

  const authHook = makeAuthHook(config.officeToken);

  await app.register(async (api) => {
    api.addHook('onRequest', authHook);
    registerHealthRoutes(api, holder);
    registerSqlRoutes(api, holder);
    registerSnapshotRoutes(api, Object.assign(holder, { dbPath: config.dbPath }));
  });

  if (config.staticDir && existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
    app.log.info({ dir: config.staticDir }, 'Static frontend servi');
  } else {
    app.log.info('STATIC_DIR non configuré ou absent : aucun asset statique servi');
  }

  const closeGracefully = async (signal: string) => {
    app.log.info({ signal }, 'Arrêt du serveur...');
    try {
      await app.close();
      holder.db.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Erreur pendant l'arrêt");
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void closeGracefully('SIGINT'));
  process.on('SIGTERM', () => void closeGracefully('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      { port: config.port, host: config.host, dbPath: config.dbPath },
      'Cabinet Cenon API démarrée',
    );
  } catch (err) {
    app.log.error({ err }, 'Impossible de démarrer le serveur');
    process.exit(1);
  }
}

main();
