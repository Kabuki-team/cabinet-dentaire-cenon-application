# Installation au cabinet — version rapide

Guide pour le **PC serveur du secrétariat**. Les 4 postes cabinet n'ont rien à installer.

Durée : **15 minutes**.

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
