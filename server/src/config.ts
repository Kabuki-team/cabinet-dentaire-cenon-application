import { resolve } from 'node:path';

export interface AppConfig {
  port: number;
  host: string;
  officeToken: string;
  dbPath: string;
  staticDir: string | null;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

function readEnv(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (raw !== undefined && raw !== '') return raw;
  if (fallback !== undefined) return fallback;
  throw new Error(`Variable d'environnement manquante : ${name}`);
}

export function loadConfig(): AppConfig {
  const token = readEnv('OFFICE_TOKEN');
  if (token === 'changeme-generate-with-openssl-rand-hex-32' || token.length < 16) {
    throw new Error(
      "OFFICE_TOKEN non configuré ou trop faible. Générer une valeur avec `openssl rand -hex 32` et la mettre dans .env",
    );
  }

  const staticDirRaw = process.env.STATIC_DIR ?? '';
  const staticDir = staticDirRaw ? resolve(process.cwd(), staticDirRaw) : null;

  return {
    port: Number.parseInt(readEnv('PORT', '3000'), 10),
    host: readEnv('HOST', '0.0.0.0'),
    officeToken: token,
    dbPath: resolve(process.cwd(), readEnv('DB_PATH', './data/cenon.db')),
    staticDir,
    logLevel: readEnv('LOG_LEVEL', 'info') as AppConfig['logLevel'],
  };
}
