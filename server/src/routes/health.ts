import type { FastifyInstance } from 'fastify';
import { getVersion, type DbHolder } from '../db.js';

export function registerHealthRoutes(app: FastifyInstance, holder: DbHolder) {
  app.get('/api/health', async () => {
    const { version, updatedAt } = getVersion(holder.db);
    return {
      status: 'ok',
      version,
      updatedAt,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  });
}
