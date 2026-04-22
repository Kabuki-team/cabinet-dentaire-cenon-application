# Guide de déploiement — Cabinet Dentaire Cenon (Phase 1)

> ⚡ **Chemin rapide** : utiliser le `.exe` produit par GitHub Actions. Voir [INSTALL.md](./INSTALL.md) — 15 min chrono.
>
> Ce document (DEPLOYMENT.md) décrit le chemin **manuel avancé** via archive ZIP + scripts PowerShell, utile pour : diagnostics, air-gap (pas d'accès GitHub depuis le cabinet), customisation fine.

Ce document explique pas-à-pas comment installer l'application dans un cabinet dentaire :
**1 PC serveur** (secrétariat, Windows 11) + **4 PC clients** (cabinets praticiens, Windows 11).

Temps estimé : **2-3 heures** si tout se passe bien, dont ~1 h d'installation et le reste en tests et formation.

---

## Vue d'ensemble

```
┌─────────────── PC Secrétariat (Windows 11) ──────────────┐
│  Service "CabinetCenonAPI" (NSSM)                         │
│  └─ Node.js + Fastify + SQLite                            │
│     écoute http://<ip-locale>:3000                        │
│                                                            │
│  Fichiers :                                                │
│    C:\Cabinet\server\  (code + scripts)                   │
│    C:\Cabinet\dist\    (UI React servie en statique)     │
│    C:\Cabinet\data\    (cenon.db + WAL)                   │
│    C:\Cabinet\logs\    (rotation 10 Mo)                   │
│    C:\Cabinet\backups\ (backups quotidiens, 30 jours)     │
└────────────────────────────────────────────────────────────┘
             ↑ réseau local filaire/WiFi cabinet
        ┌────┴────┬────────┬────────┐
     Cabinet1  Cabinet2  Cabinet3  Cabinet4
     (raccourci Edge/Chrome → http://<ip-serveur>:3000)
```

**Phase 1** : les 4 postes cabinet ouvrent l'URL dans un navigateur. Pas d'installation côté cabinet.
**Phase 2** (plus tard) : chaque poste cabinet installe un MSI Tauri avec HTTPS + JWT.

---

## Prérequis

### Sur le PC serveur (secrétariat)

- [ ] Windows 11 Pro ou Famille
- [ ] Compte administrateur local disponible
- [ ] IP locale fixe (à réserver dans la box, ex : `192.168.1.10`) — voir §2
- [ ] Accès Internet pour télécharger Node.js et NSSM la première fois
- [ ] BitLocker activé sur le disque système (fortement recommandé — Panneau de configuration → BitLocker)

### Logiciels à télécharger

À rassembler sur une clé USB ou à télécharger directement sur le PC serveur :

1. **Node.js LTS 22** : https://nodejs.org/ → « LTS » → Windows Installer (64-bit, .msi)
2. **NSSM** (Non-Sucking Service Manager) : https://nssm.cc/download → dernière version stable (2.24+)
3. **SQLite CLI** (pour backups propres) : https://www.sqlite.org/download.html → *Precompiled Binaries for Windows* → `sqlite-tools-win-x64-XXXX.zip`
4. **Archive de déploiement** : produite par `npm run package:cabinet` côté dev, fichier `cabinet-cenon-<version>-<date>.zip`

### Sur chaque PC cabinet

Rien à installer. Juste un navigateur **Edge** (préinstallé Windows 11) ou **Chrome** à jour.

---

## 1. Fabriquer l'archive (côté dev, macOS ou Linux)

### 1.1 Préparer .env.production

Le token d'authentification doit être **identique côté client et côté serveur**. Comme le client est baké au build, il faut créer un `.env.production` à la racine du repo **avant** de packager :

```bash
cd /path/to/cabinet-dentaire-cenon-application
cp .env.production.example .env.production

# Générer un token solide (à conserver précieusement — noter dans un gestionnaire de mots de passe)
openssl rand -hex 32

# Éditer .env.production :
#   VITE_SERVER_URL=http://192.168.1.10:3000     ← l'IP fixe du PC serveur cabinet
#   VITE_OFFICE_TOKEN=<la valeur générée>
```

### 1.2 Packager

```bash
npm install            # si pas déjà fait (inclut le workspace server/)
cd server && npm install && cd ..
npm run package:cabinet
# → produit releases/cabinet-cenon-<version>-<date>.zip
# Le script vérifie .env.production et refuse de continuer si le token est un placeholder.
```

Transférer ce ZIP + les installeurs Node/NSSM/SQLite CLI sur le PC serveur du cabinet (clé USB recommandée).

**Noter précieusement le token** — il faudra le saisir dans le `.env` serveur (§3.3) pour que la valeur corresponde.

---

## 2. Configurer l'IP fixe du PC serveur

Éviter que l'IP du serveur change au redémarrage, sinon les clients devront être reconfigurés.

**Option A — réservation DHCP (recommandé)** :
Interface de la box Internet → Réseau local → Réservations DHCP → associer l'adresse MAC du PC à l'IP souhaitée (ex : 192.168.1.10).

**Option B — IP statique Windows** :
Paramètres → Réseau et Internet → Ethernet (ou Wi-Fi) → Modifier l'attribution IP → Manuelle → IPv4 :
- Adresse IP : `192.168.1.10`
- Masque : `255.255.255.0`
- Passerelle : IP de la box (ex : `192.168.1.1`)
- DNS : `192.168.1.1` ou `1.1.1.1`

Vérifier : `ipconfig` dans PowerShell doit afficher l'IP fixe.

---

## 3. Installation sur le PC serveur

### 3.1 Installer Node.js et NSSM

1. Exécuter l'installeur Node.js MSI → *Next, Next, Finish* (défauts).
2. Ouvrir un PowerShell et vérifier : `node --version` doit renvoyer `v22.x.x`.
3. Décompresser l'archive NSSM, copier `win64\nssm.exe` dans `C:\Windows\System32\`.
4. Vérifier : `nssm --version` affiche la version.
5. Décompresser SQLite CLI, copier `sqlite3.exe` dans `C:\Windows\System32\`.
6. Vérifier : `sqlite3 --version` affiche la version.

### 3.2 Extraire l'archive de déploiement

1. Créer le dossier `C:\Cabinet\`.
2. Dézipper `cabinet-cenon-<version>-<date>.zip` dans un dossier temporaire.
3. Déplacer le contenu du dossier `cabinet-cenon-<version>-<date>\` vers `C:\Cabinet\` → on obtient :
   ```
   C:\Cabinet\server\
   C:\Cabinet\dist\
   C:\Cabinet\DEPLOYMENT.md
   ```

### 3.3 Configurer le .env

```powershell
cd C:\Cabinet\server
Copy-Item .env.example .env
notepad .env
```

Éditer :
- `PORT=3000` (ou autre si 3000 est déjà pris)
- `HOST=0.0.0.0` (obligatoire pour être joignable sur le LAN)
- `OFFICE_TOKEN=...` → **coller ici EXACTEMENT le même token que `VITE_OFFICE_TOKEN` dans le `.env.production` utilisé au build** (§1.1). Sinon les clients cabinet recevront du 401.
- `DB_PATH=C:\Cabinet\data\cenon.db`
- `STATIC_DIR=..\dist`
- `LOG_LEVEL=info`

Sauvegarder et fermer.

### 3.4 Lancer l'installation du service

```powershell
cd C:\Cabinet\server
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-service.ps1
```

Le script va :
- vérifier les prérequis
- créer les dossiers data/logs
- lancer `npm install` (download de better-sqlite3 natif win32)
- builder le backend TypeScript si besoin
- créer le service Windows *CabinetCenonAPI* via NSSM
- autoriser le port 3000 dans le firewall Windows (profil Private)
- démarrer le service

À la fin, il affiche `Statut : Running`.

### 3.5 Tester le serveur localement

```powershell
$token = (Get-Content C:\Cabinet\server\.env | Select-String 'OFFICE_TOKEN=').Line.Split('=', 2)[1]
Invoke-RestMethod http://localhost:3000/api/health -Headers @{ 'X-Office-Token' = $token }
```

Réponse attendue :
```json
{"status":"ok","version":0,"updatedAt":"...","node":"v22.x.x","uptimeSeconds":5}
```

### 3.6 Tester depuis un autre poste du LAN

Sur n'importe quel autre PC du cabinet, ouvrir PowerShell :
```powershell
Invoke-RestMethod http://192.168.1.10:3000/api/health -Headers @{ 'X-Office-Token' = '<coller le token>' }
```

Si ça répond : **le LAN est OK**. Sinon, vérifier dans l'ordre :
1. Les deux PC sont sur le même réseau (`ipconfig`).
2. Le profil réseau Windows est **Privé** sur le serveur (pas Public) : Paramètres → Réseau → propriétés → Type de profil.
3. Le firewall bloque : tester temporairement en le désactivant sur le serveur (`Set-NetFirewallProfile -Profile Private -Enabled False`) — si ça passe, c'est que la règle firewall n'est pas bonne.

---

## 4. Configurer les 4 postes cabinet

Sur chaque poste cabinet :

1. Ouvrir Microsoft Edge (ou Chrome).
2. Aller à `http://192.168.1.10:3000/` → l'application doit se charger.
3. Créer un raccourci sur le bureau :
   - Clic droit bureau → Nouveau → Raccourci
   - Cible : `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://192.168.1.10:3000/`
   - Nom : *Cabinet Cenon*
   - (Optionnel) changer l'icône : clic droit → Propriétés → Raccourci → Changer d'icône.
4. (Optionnel) épingler le raccourci au menu Démarrer et à la barre des tâches.

L'option `--app=` lance Edge en mode "application" sans barre d'adresse, proche d'une app native.

---

## 5. Sauvegardes automatiques

### 5.1 Planifier le backup quotidien

Ouvrir le *Planificateur de tâches* (Taskschd.msc) en Admin :

1. *Créer une tâche* (pas *Créer une tâche de base* — on veut plus d'options).
2. **Général** :
   - Nom : *Cabinet Cenon — Backup quotidien*
   - Exécuter que l'utilisateur soit connecté ou non
   - Exécuter avec les autorisations maximales
3. **Déclencheurs** → Nouveau :
   - Quotidien
   - Début : 23:00
   - Récurrence tous les 1 jours
4. **Actions** → Nouveau :
   - Action : *Démarrer un programme*
   - Programme : `PowerShell.exe`
   - Arguments : `-ExecutionPolicy Bypass -File C:\Cabinet\server\scripts\backup.ps1`
5. **Paramètres** :
   - Cocher *Arrêter la tâche si elle s'exécute pendant plus de 30 minutes*
   - Cocher *Si la tâche ne se termine pas à la demande, la forcer à s'arrêter*

Tester immédiatement : clic droit sur la tâche → Exécuter. Vérifier que `C:\Cabinet\backups\cenon-<date>.db` est créé.

### 5.2 Backup externe (fortement recommandé)

Brancher un disque USB externe sur le PC serveur et ajouter une seconde tâche planifiée qui copie `C:\Cabinet\backups\*.db` vers ce disque. Exemple :
```powershell
Copy-Item C:\Cabinet\backups\*.db E:\CabinetBackups\ -Force
```

Chiffrer le disque externe (BitLocker to go) — critique pour données médicales.

### 5.3 Restauration

```powershell
cd C:\Cabinet\server
.\scripts\restore.ps1 -BackupFile C:\Cabinet\backups\cenon-20260420-230000.db
```

Le script arrête le service, sauvegarde l'état courant dans `rollback-<date>.db`, remplace la DB, relance le service.

---

## 6. Mise à jour

Produire une nouvelle archive côté dev puis :

```powershell
# Extraire la nouvelle archive dans un dossier temporaire, ex C:\Temp\cabinet-cenon-v0.2.0
cd C:\Cabinet\server
.\scripts\update-service.ps1 -NewSourceDir C:\Temp\cabinet-cenon-v0.2.0\server
```

Le script :
- fait un backup de sécurité *pre-update-...*,
- stoppe le service,
- remplace les fichiers en préservant `.env`, `data\`, `logs\`,
- `npm install` + build + redémarrage.

---

## 7. Désinstallation

```powershell
cd C:\Cabinet\server
.\scripts\uninstall-service.ps1
```

Supprime le service + la règle firewall. Les données et les logs sont **conservés** — les effacer manuellement si souhaité.

---

## 8. Incidents fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Invoke-RestMethod` retourne *401 Unauthorized* | `OFFICE_TOKEN` différent entre client et serveur, ou header manquant | Vérifier que le token dans le `.env` serveur est identique au `VITE_OFFICE_TOKEN` baké dans le build client (`C:\Cabinet\dist`) |
| Un cabinet ne joint pas le serveur | IP changée, profil réseau passé en Public, firewall | Voir §3.6 |
| Service ne démarre pas | Port 3000 déjà utilisé | Changer `PORT=3001` dans `.env`, relancer install-service.ps1 |
| `better-sqlite3` erreur au démarrage | Binaire natif incompatible | `cd C:\Cabinet\server ; npm rebuild better-sqlite3` |
| Disque plein | Logs non tournés ou backups accumulés | Les logs tournent auto à 10 Mo. Les backups > 30 jours sont purgés par `backup.ps1`. Vérifier `C:\Cabinet\logs\` et `C:\Cabinet\backups\` |
| Le service s'arrête seul après quelques heures | Erreur non gérée côté Node | NSSM redémarre auto après 5 s. Consulter `C:\Cabinet\logs\api-stderr.log` pour la cause |

---

## 9. Contact support

- Logs serveur : `C:\Cabinet\logs\api-stderr.log` et `api-stdout.log`
- Logs Windows : `eventvwr.msc` → Journaux Windows → Application, filtrer par *CabinetCenonAPI*
- État service : `Get-Service CabinetCenonAPI` ou `services.msc`

En cas de blocage, joindre les logs complets + la sortie de `Invoke-RestMethod http://localhost:3000/api/health -Headers @{ 'X-Office-Token' = '<token>' } -ErrorAction Continue`.

---

## 10. Limites Phase 1 (à garder en tête)

- Pas de HTTPS : les données transitent en clair sur le LAN filaire du cabinet. Acceptable sur un réseau physique maîtrisé, à durcir en Phase 2.
- Auth par **token partagé** (pas de comptes utilisateurs individuels). Tout le monde tape le même token. L'audit log ne trace pas *qui* a modifié quoi.
- Propagation des modifications entre postes : **jusqu'à 15 s** (polling). Rafraîchir la page pour voir immédiatement.
- Pas de verrou d'écriture concurrente fine : deux utilisateurs modifiant le même commentaire au même moment → le dernier écrit gagne.
- Pas de mode offline côté cabinet : si le PC serveur est éteint/déconnecté, les cabinets voient une bannière *"Serveur injoignable"* et ne peuvent pas écrire.

La Phase 2 (prévue 2-4 semaines post-Phase 1) adresse ces points : HTTPS, comptes + rôles, audit par utilisateur, sync optimisée, mode hors-ligne propre côté Tauri MSI.
