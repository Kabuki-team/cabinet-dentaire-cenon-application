# Release & distribution (côté dev)

Procédure pour sortir une nouvelle version destinée au cabinet dentaire.

## Prérequis (une fois)

### Secrets GitHub

Dans **Settings → Secrets and variables → Actions**, définir :

| Secret | Rôle | Exemple de valeur |
|---|---|---|
| `VITE_OFFICE_TOKEN` | Token partagé client ↔ serveur. Baké dans le bundle JS au build **et** écrit dans le `.env` du serveur au moment de l'install. Au moins 32 chars. | `openssl rand -hex 32` |
| `TAURI_SIGNING_PRIVATE_KEY` | (existant) clé privée pour signer les updates Tauri | inchangé |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (existant) passphrase de la clé | inchangé |

**Rotation du token** : si tu rotates `VITE_OFFICE_TOKEN`, le prochain installeur produit aura le nouveau token. Les clients déjà déployés doivent réinstaller la nouvelle version pour recevoir la nouvelle valeur (client *et* serveur changent en même temps).

### Permissions du workflow

Déjà configurées dans [.github/workflows/release.yml](.github/workflows/release.yml) : `contents: write` pour publier les releases.

## Sortir une release

```bash
# 1. Bump version dans package.json, server/package.json, src-tauri/tauri.conf.json
#    (conserver les 3 cohérents)

# 2. Commit et tag
git add -A
git commit -m "release: v1.2.3"
git tag v1.2.3
git push && git push --tags
```

Le push du tag déclenche le workflow *Release* qui lance **en parallèle** :

- **Job `build-tauri`** : builds Tauri (MSI Windows + DMG macOS arm64 + x86_64) signés, publiés en **draft release** via `tauri-action`. Utiles pour Phase 2 et usage local.
- **Job `build-installer`** : build l'installeur tout-en-un Cabinet Cenon (`CabinetCenon-Setup-<version>.exe`) et l'ajoute à la **même** draft release.

Durée typique : **15-25 min** (les builds Tauri macOS dominent).

## Publier la release

Les jobs produisent une release **draft**. Pour rendre la release visible :

1. Aller sur https://github.com/Kabuki-team/cabinet-dentaire-cenon-application/releases
2. Éditer la draft de la version
3. Vérifier les assets :
   - `CabinetCenon-Setup-<version>.exe` ← **le seul fichier dont le cabinet a besoin**
   - `CabinetCenon-Setup-<version>.exe.sha256`
   - (bonus Tauri) `*.msi`, `*.msi.sig`, `*.dmg`, `latest.json`
4. Ajouter un message (changelog)
5. **Publish release**

## Test manuel de l'installeur (optionnel)

Pour tester sans publier :

1. Aller dans Actions → Release → *Run workflow* (workflow_dispatch) sur la branche de ton choix.
2. Le job `build-installer` produit un artefact téléchargeable pendant 30 jours (pas de release créée).
3. Télécharger → installer sur une VM Windows 11 propre → valider.

## Tester localement (sans CI)

Sur macOS/Linux, on peut valider le packaging sans installeur Windows via l'ancienne route :

```bash
cp .env.production.example .env.production
# remplir VITE_OFFICE_TOKEN avec un openssl rand -hex 32
npm run package:cabinet
# → releases/cabinet-cenon-<version>-<date>.zip (voir DEPLOYMENT.md)
```

Cette archive ZIP n'est plus la méthode recommandée pour le cabinet (cf [INSTALL.md](./INSTALL.md)), mais reste utile pour le debug.

## Architecture du workflow

```
Git tag vX.Y.Z
    │
    └──► GitHub Actions "Release"
             ├──► build-tauri (matrix macos/win) ──► MSI, DMG, latest.json
             └──► build-installer (windows-latest)
                       ├─ npm ci + vite build (client, token baké)
                       ├─ npm ci + tsc (server)
                       ├─ npm ci --omit=dev dans installer/bundle/server/
                       ├─ download Node portable 22.11
                       ├─ download NSSM 2.24 + SQLite CLI
                       ├─ iscc installer/CabinetCenon.iss
                       └─ upload CabinetCenon-Setup-<ver>.exe + .sha256
                    ↓
                  Même release GitHub draft
```

## Fichiers clés du pipeline

| Fichier | Rôle |
|---|---|
| [.github/workflows/release.yml](.github/workflows/release.yml) | 2 jobs parallèles (Tauri legacy + installeur Cabinet) |
| [installer/CabinetCenon.iss](installer/CabinetCenon.iss) | Script Inno Setup : layout, pages, hooks |
| [installer/silent-install.ps1](installer/silent-install.ps1) | Appelé pendant install : écrit `.env`, crée service NSSM, firewall, backup planifié |
| [installer/silent-uninstall.ps1](installer/silent-uninstall.ps1) | Appelé pendant uninstall : nettoyage service + firewall + tâche |
| [server/](server/) | Backend Node.js/Fastify/better-sqlite3 |
| [src/lib/db.ts](src/lib/db.ts) | Client sql.js hydraté depuis `/api/db/snapshot`, intercept writes → POST `/api/sql/exec` |
