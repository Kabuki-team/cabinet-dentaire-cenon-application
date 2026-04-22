// Configuration réseau côté client. Valeurs injectées par Vite au build à partir
// de `.env.local` (dev) ou `.env.production` (build cabinet).
//
// Phase 1 : token partagé. En Phase 2, ce fichier sera remplacé par un écran de config
// au premier lancement + storage du JWT dans @tauri-apps/plugin-store.

const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
const OFFICE_TOKEN = import.meta.env.VITE_OFFICE_TOKEN ?? '';

if (!OFFICE_TOKEN) {
  console.warn(
    "[config] VITE_OFFICE_TOKEN non défini. Les appels backend échoueront avec 401. " +
      "Créer un fichier .env.local à la racine du projet, ou définir la variable au build.",
  );
}

// Intervalle de polling de la version serveur. 15 s est un compromis entre réactivité
// (annotations propagées) et charge réseau. Override possible via VITE_POLL_INTERVAL_MS.
const POLL_INTERVAL_MS = Number.parseInt(
  import.meta.env.VITE_POLL_INTERVAL_MS ?? '15000',
  10,
);

export const config = {
  serverUrl: SERVER_URL, // chaîne vide en dev → proxy Vite /api -> 127.0.0.1:3456
  officeToken: OFFICE_TOKEN,
  pollIntervalMs: POLL_INTERVAL_MS,
};

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${config.serverUrl}${p}`;
}
