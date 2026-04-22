# Installation au cabinet — version rapide

Guide pour le **PC serveur du secrétariat**. Les 4 postes cabinet n'ont rien à installer.

Durée : **15 minutes**.

## Choisir la bonne version selon l'OS du serveur

| OS du PC serveur | Fichier à télécharger |
|---|---|
| Windows 11 (le plus courant) | `CabinetCenon-Setup-<version>.exe` — lire ci-dessous |
| macOS Apple Silicon (M1/M2/M3/M4) | `CabinetCenon-<version>-arm64.pkg` — voir [§ macOS](#installation-sur-mac-serveur) |
| macOS Intel | `CabinetCenon-<version>-x64.pkg` — voir [§ macOS](#installation-sur-mac-serveur) |

Les 4 postes cabinet peuvent tourner sur n'importe quel OS (Windows, macOS, Linux, Chromebook) — seul le navigateur compte.

---

## 1. Télécharger l'installeur

Aller sur la page Releases GitHub du projet, sur la dernière version :
→ télécharger `CabinetCenon-Setup-<version>.exe`

(Optionnel) télécharger aussi `CabinetCenon-Setup-<version>.exe.sha256` pour vérifier l'intégrité :
```powershell
Get-FileHash -Algorithm SHA256 CabinetCenon-Setup-<version>.exe
# comparer à la valeur dans le .sha256
```

---

## 2. Lancer l'installation

1. Double-cliquer sur `CabinetCenon-Setup-<version>.exe`.
2. Si Windows affiche *"Windows a protégé votre PC"* (écran bleu SmartScreen) :
   - cliquer sur **Informations complémentaires**
   - cliquer sur **Exécuter quand même**
   (Ce message apparaît car l'installeur n'est pas signé par un certificat commercial — c'est sans risque.)
3. Accepter l'élévation UAC (mot de passe administrateur).
4. Dans l'assistant :
   - **Langue** : Français
   - **Dossier d'installation** : laisser `C:\Cabinet\` (recommandé)
   - Cliquer **Installer**
5. La barre de progression montre :
   - Copie de Node.js, du serveur et du frontend
   - Enregistrement du service Windows
   - Ouverture du port 3000 dans le pare-feu
   - Démarrage du service
6. Écran final → noter l'**URL LAN** affichée, par exemple :
   ```
   http://192.168.1.42:3000/
   ```

---

## 3. Configurer les 4 postes cabinet

Deux options selon votre préférence.

### Option A — à la main (3 min / poste)

Sur chaque poste cabinet, ouvrir Edge (ou Chrome) et aller à l'URL affichée à l'écran final.

Si l'app charge → créer un raccourci sur le bureau :
- Clic droit bureau → Nouveau → Raccourci
- Cible : `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://192.168.1.42:3000/`
- Nom : *Cabinet Cenon*

Le flag `--app=` ouvre l'app sans barre d'adresse, comme une application native.

### Option B — avec le raccourci généré par l'installeur

L'installeur a créé automatiquement un raccourci `Cabinet Cenon.url` dans :
```
C:\Cabinet\Raccourci-postes-cabinet\
```

Copier ce fichier sur une clé USB, puis sur chaque poste cabinet :
- coller le fichier sur le bureau.
- Double-cliquer → ça ouvre l'URL dans le navigateur par défaut.

(Option B est plus rapide si USB sous la main, mais n'utilise pas le mode `--app=`.)

---

## 4. Sauvegardes

L'installeur a planifié une tâche Windows qui fait un backup quotidien à **23h00** dans `C:\Cabinet\backups\`, avec rotation automatique sur 30 jours.

**Recommandation forte** : copier ces backups aussi sur un disque externe chiffré (BitLocker). Brancher un disque USB dédié et créer une 2ᵉ tâche planifiée qui exécute :
```powershell
Copy-Item C:\Cabinet\backups\*.db E:\CabinetBackups\ -Force
```

---

## 5. Mise à jour

Télécharger la nouvelle version `CabinetCenon-Setup-<new-version>.exe` → double-cliquer → Installer.

L'installeur :
- arrête automatiquement le service en cours,
- préserve les données (`data\`, `logs\`, `backups\`) et le `.env`,
- remplace les binaires et le frontend,
- redémarre le service.

---

## 6. Désinstallation

Panneau de configuration → Programmes → *Cabinet Dentaire Cenon* → Désinstaller.

L'installeur :
- arrête et supprime le service Windows,
- supprime la règle pare-feu,
- supprime la tâche planifiée de backup,
- **conserve** les données (`C:\Cabinet\data`, `backups`, `logs`) — à supprimer manuellement si souhaité.

---

## 7. Problèmes fréquents

| Symptôme | Cause | Solution |
|---|---|---|
| Page blanche dans le navigateur | Service pas démarré | `services.msc` → vérifier **Cabinet Cenon API** → Démarrer. Logs : `C:\Cabinet\logs\api-stderr.log` |
| Un poste cabinet n'accède pas | Pare-feu / mauvais réseau | Sur le PC serveur : vérifier que le profil réseau est *Privé* (Paramètres → Réseau). Tester `ping 192.168.1.42` depuis le poste cabinet |
| URL change au redémarrage | IP DHCP dynamique | Réserver l'IP dans la box (Menu box → DHCP → Réservation par adresse MAC) |
| Erreur au 1er lancement de l'installeur | VC++ Redist manquant (rare avec Node 22) | Installer *Microsoft Visual C++ Redistributable 2015-2022 x64* |

---

## Support

- Logs : `C:\Cabinet\logs\api-stdout.log` et `api-stderr.log`
- État : `Get-Service CabinetCenonAPI` en PowerShell
- Test API : `Invoke-RestMethod http://localhost:3000/api/health -Headers @{ "X-Office-Token" = "<token>" }`

Le token est écrit dans `C:\Cabinet\server\.env` — ne pas le communiquer.

---

# Installation sur Mac serveur

Flow strictement équivalent à Windows, juste avec les conventions macOS.

## 1. Télécharger le .pkg

Depuis la page Releases GitHub, choisir selon le Mac :
- `CabinetCenon-<version>-arm64.pkg` pour Mac M1/M2/M3/M4 (Apple Silicon)
- `CabinetCenon-<version>-x64.pkg` pour Mac Intel (plus rare)

Pour savoir lequel : `Menu Pomme → À propos de ce Mac → voir "Puce" ou "Processeur"`.

## 2. Lancer l'install

1. Double-cliquer sur le `.pkg` téléchargé.
2. Si Gatekeeper affiche *"Cabinet Cenon.pkg ne peut pas être ouvert car Apple ne peut pas vérifier..."* :
   - **Clic droit** (ou Ctrl+clic) sur le `.pkg` → **Ouvrir**
   - Cliquer à nouveau **Ouvrir** dans la boîte de dialogue qui confirme
   (Ou : `Réglages Système → Confidentialité et sécurité → Ouvrir quand même` pour le fichier bloqué)
3. Suivre l'assistant d'installation : *Continuer → Installer → mot de passe administrateur*
4. Le panneau final indique "Installation réussie"

**Emplacements créés :**
- `/Applications/Cabinet Cenon/` — binaires (Node.js, backend, frontend)
- `/Library/Application Support/CabinetCenon/` — données : `data/cenon.db`, `logs/`, `backups/`
- `/Library/LaunchDaemons/fr.cenon.cabinet.plist` — définition du daemon

Le daemon est **chargé et démarré automatiquement** par l'installeur. Il redémarre au boot du Mac et après crash.

## 3. Vérifier

Dans Terminal :
```bash
sudo launchctl list | grep cenon
# → Doit afficher PID numérique et fr.cenon.cabinet

curl -H "X-Office-Token: $(sudo sed -n 's/^OFFICE_TOKEN=//p' '/Applications/Cabinet Cenon/server/.env')" http://localhost:3000/api/health
# → {"status":"ok","version":0,"updatedAt":"...","node":"v22.11.0","uptimeSeconds":N}
```

Ouvrir `http://localhost:3000/` dans Safari → page login du cabinet.

## 4. Pour les 4 postes cabinet

Trouver l'IP LAN du Mac serveur :
```bash
ipconfig getifaddr en0    # ou en1 pour Wi-Fi
```

Sur chaque poste cabinet (Windows, Mac, ou autre), bookmarker `http://<ip-mac>:<port>/` dans le navigateur, comme décrit plus haut §3.

## 5. Gestion du daemon

| Action | Commande |
|---|---|
| Voir l'état | `sudo launchctl list \| grep cenon` |
| Arrêter | `sudo launchctl unload /Library/LaunchDaemons/fr.cenon.cabinet.plist` |
| Redémarrer | `sudo launchctl unload … && sudo launchctl load -w …` |
| Logs | `tail -f "/Library/Application Support/CabinetCenon/logs/api-stderr.log"` |

## 6. Désinstallation macOS

Pas de désinstalleur natif `.pkg` (limitation du format Apple). Script manuel :
```bash
sudo launchctl unload /Library/LaunchDaemons/fr.cenon.cabinet.plist
sudo rm /Library/LaunchDaemons/fr.cenon.cabinet.plist
sudo rm -rf "/Applications/Cabinet Cenon"
# Optionnel (supprime aussi les données) :
# sudo rm -rf "/Library/Application Support/CabinetCenon"
```

## 7. Pare-feu macOS

Par défaut **désactivé** sur macOS grand public. Si activé (Préférences Système → Réseau → Pare-feu) :
- Le Mac affichera un prompt *"Souhaitez-vous autoriser node à accepter des connexions entrantes ?"* au premier démarrage du service → **Autoriser**.
- Alternative CLI : `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "/Applications/Cabinet Cenon/node/bin/node"`

## 8. Mise à jour macOS

Télécharger le nouveau `.pkg` et le lancer — l'installeur détecte la version précédente, arrête le daemon, remplace les fichiers, relance. Les données dans `/Library/Application Support/CabinetCenon/` sont préservées.

## 9. Backup macOS

Actuellement, la tâche planifiée Windows n'a pas d'équivalent automatique côté Mac (plus de dev pour un cron via launchd). Pour backup manuel :
```bash
sudo sqlite3 "/Library/Application Support/CabinetCenon/data/cenon.db" \
  "VACUUM INTO '/Library/Application Support/CabinetCenon/backups/cenon-$(date +%Y%m%d).db'"
```

Planifier via `cron -e` ou créer un LaunchAgent — à faire manuellement. (À automatiser dans une version ultérieure si tu passes sur serveur Mac.)
