# cabinet-cenon-server

Backend Phase 1 du déploiement multi-postes du Cabinet Dentaire Cenon.

- **Stack** : Fastify 5 + better-sqlite3 (WAL) + TypeScript strict, ESM natif.
- **Rôle** : héberge la base SQLite faisant autorité sur le PC secrétariat ; expose un endpoint SQL limité, un snapshot binaire de la DB et une route d'upload pour la migration initiale.
- **Auth** : header `X-Office-Token` partagé (remplacé par JWT + comptes utilisateurs en Phase 2).

## Démarrage

```bash
cd server
cp .env.example .env
# éditer .env, en particulier OFFICE_TOKEN (openssl rand -hex 32)
npm install
npm run dev          # watch mode (tsx)
# ou
npm run build && npm start
```

## Endpoints

Tous les endpoints exigent `X-Office-Token: <valeur .env>`.

| Méthode | Chemin               | Description                                                                 |
|---------|----------------------|-----------------------------------------------------------------------------|
| GET     | `/api/health`        | Ping + version + uptime.                                                    |
| GET     | `/api/db/version`    | `{ version, updatedAt }` pour polling léger côté clients (15 s).            |
| GET     | `/api/db/snapshot`   | Renvoie le fichier SQLite complet (octet-stream), sert à hydrater sql.js.   |
| POST    | `/api/db/upload`     | Remplace la DB serveur par un fichier SQLite uploadé. `X-Confirm-Replace: yes` obligatoire. |
| POST    | `/api/sql/exec`      | Applique un batch `{ statements: [{ sql, params? }] }` en transaction.      |
| POST    | `/api/sql/query`     | Exécute un SELECT, renvoie `{ columns, values }` (format sql.js).           |

## Sécurité Phase 1 (documentée dans le plan)

- HTTP clair sur LAN uniquement. Pour HTTPS → Phase 2 avec `mkcert`.
- Token partagé, pas d'audit par utilisateur.
- L'endpoint `/api/sql/exec` bloque `ATTACH`/`DETACH`/`VACUUM`/`load_extension`/`PRAGMA journal_mode|synchronous|foreign_keys`/`DROP DATABASE`.

## Déploiement Windows (prévu lot 1.5)

```powershell
# 1. Installer Node.js LTS 22+.
# 2. Copier server/ + dist/ sur C:\Cabinet\
# 3. Créer C:\Cabinet\.env à partir de .env.example.
# 4. Service via NSSM :
nssm install CabinetCenonAPI "C:\Program Files\nodejs\node.exe" "C:\Cabinet\server\dist\server.js"
nssm set CabinetCenonAPI AppDirectory "C:\Cabinet\server"
nssm set CabinetCenonAPI AppEnvironmentExtra "NODE_ENV=production"
nssm start CabinetCenonAPI
# 5. Firewall :
New-NetFirewallRule -DisplayName "Cabinet Cenon API" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow -Profile Private
```
