; Inno Setup 6+ — installeur tout-en-un pour le PC serveur du cabinet.
; Ce script est compilé par `iscc.exe` avec les #define suivants passés par GitHub Actions :
;   /DMyAppVersion=1.2.3
;   /DOFFICE_TOKEN=<64 hex chars>
;   /DPort=3000
; Produit CabinetCenon-Setup-<version>.exe à côté.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif
#ifndef OFFICE_TOKEN
  #define OFFICE_TOKEN "REPLACE_AT_BUILD"
#endif
#ifndef Port
  #define Port "3000"
#endif

#define MyAppName       "Cabinet Dentaire Cenon"
#define MyAppPublisher  "Kabuki"
#define MyAppURL        "https://github.com/Kabuki-team/cabinet-dentaire-cenon-application"
#define ServiceName     "CabinetCenonAPI"

[Setup]
AppId={{6F4C2C57-5F7E-4B8B-9F7A-C1A5E8C9D2B3}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
DefaultDirName=C:\Cabinet
DefaultGroupName={#MyAppName}
DisableDirPage=no
DisableProgramGroupPage=yes
OutputBaseFilename=CabinetCenon-Setup-{#MyAppVersion}
Compression=lzma2/ultra
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\favicon.ico
WizardImageStretch=no
; Fichier de licence affiché au 1er écran (facultatif — créer installer/LICENSE.txt si on veut)
; LicenseFile=LICENSE.txt

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
; Node.js portable (node.exe + minimales). Pré-extrait dans bundle\node par le CI.
Source: "bundle\node\*";    DestDir: "{app}\node";    Flags: recursesubdirs ignoreversion

; Binaires outils : nssm.exe, sqlite3.exe. Pré-téléchargés dans bundle\bin par le CI.
Source: "bundle\bin\*";     DestDir: "{app}\bin";     Flags: ignoreversion

; Backend compilé + node_modules (better-sqlite3 natif win32-x64 inclus).
Source: "bundle\server\*";  DestDir: "{app}\server";  Flags: recursesubdirs ignoreversion

; Frontend buildé (React). Servi par Fastify via STATIC_DIR=..\dist → same-origin.
Source: "bundle\dist\*";    DestDir: "{app}\dist";    Flags: recursesubdirs ignoreversion

; Scripts PS1 d'install/uninstall appelés ci-dessous.
; Utilise {#SourcePath} (dir du .iss résolu à la compile) pour éviter toute
; ambiguïté sur le chemin selon d'où iscc est lancé.
Source: "{#SourcePath}silent-install.ps1";   DestDir: "{app}\installer"; Flags: ignoreversion
Source: "{#SourcePath}silent-uninstall.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion

; Icône raccourci optionnelle
Source: "{#SourcePath}bundle\favicon.ico"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
Name: "{app}\data";    Permissions: users-modify
Name: "{app}\logs";    Permissions: users-modify
Name: "{app}\backups"; Permissions: users-modify

[Run]
; Enregistre le service Windows via NSSM, écrit .env, ouvre le firewall, planifie le backup, démarre.
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\installer\silent-install.ps1"" -InstallDir ""{app}"" -OfficeToken ""{#OFFICE_TOKEN}"" -Port {#Port} -ServiceName ""{#ServiceName}"""; \
  StatusMsg: "Enregistrement du service Windows CabinetCenonAPI..."; \
  Flags: runhidden waituntilterminated

; Lancement facultatif du navigateur sur la page finale
Filename: "{sys}\cmd.exe"; \
  Parameters: "/c start http://localhost:{#Port}/"; \
  Description: "Ouvrir Cabinet Cenon dans le navigateur"; \
  Flags: postinstall nowait skipifsilent unchecked

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\installer\silent-uninstall.ps1"" -ServiceName ""{#ServiceName}"""; \
  Flags: runhidden waituntilterminated

[Icons]
; Raccourci serveur (ouvre le navigateur sur l'app)
Name: "{autodesktop}\Cabinet Cenon (serveur)"; \
  Filename: "http://localhost:{#Port}/"; \
  Comment: "Ouvre l'application Cabinet Cenon dans le navigateur"

; Dossier à la racine du disque contenant un raccourci .url à copier sur les 4 postes
Name: "{app}\Raccourci-postes-cabinet\Cabinet Cenon"; \
  Filename: "http://{code:GetLanIp}:{#Port}/"; \
  Comment: "Ouvrir l'application Cabinet Cenon — copier ce fichier sur le bureau des postes cabinet"

[Code]
// ----------------------------------------------------------------------------
// Arrêt du service AVANT copie des fichiers (cas mise à jour).
// Sinon Inno Setup ne peut pas écraser node.exe / server.js en cours d'exécution.
// ----------------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then begin
    Exec('net.exe', 'stop {#ServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    // Exit code 2 = service non démarré (ignorable), 0 = arrêté OK, autre = problème (on poursuit quand même)
  end;
end;

// ----------------------------------------------------------------------------
// Détection de l'IP LAN du PC serveur pour affichage et raccourci postes.
// ----------------------------------------------------------------------------
var
  CachedLanIp: String;

function GetLanIp(Param: String): String;
var
  TmpFile: String;
  Content: AnsiString;
  ResultCode: Integer;
  PsCmd: String;
begin
  if CachedLanIp <> '' then begin
    Result := CachedLanIp;
    exit;
  end;

  Result := 'localhost';
  TmpFile := ExpandConstant('{tmp}\lan-ip.txt');

  // Récupère la première IPv4 non loopback, non APIPA (169.254.*), non virtuelle.
  PsCmd :=
    '-NoProfile -Command "& { try { ' +
    '$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ' +
    'Where-Object { $_.PrefixOrigin -in @(''Dhcp'',''Manual'') -and $_.IPAddress -notlike ''169.254.*'' -and $_.IPAddress -ne ''127.0.0.1'' } | ' +
    'Select-Object -First 1 -ExpandProperty IPAddress; ' +
    'if ($ips) { Set-Content -Path ''' + TmpFile + ''' -Value $ips -NoNewline -Encoding ASCII } ' +
    '} catch {} }"';

  if Exec('powershell.exe', PsCmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0) then begin
    if FileExists(TmpFile) and LoadStringFromFile(TmpFile, Content) then begin
      Content := Trim(Content);
      if (Length(Content) >= 7) and (Pos('.', Content) > 0) then
        Result := String(Content);
    end;
  end;

  CachedLanIp := Result;
end;

// ----------------------------------------------------------------------------
// Vérifie qu'aucune instance précédente du service n'est déjà présente avec
// une autre version incompatible. Si oui, propose de la désinstaller d'abord.
// ----------------------------------------------------------------------------
function InitializeSetup(): Boolean;
var
  UninstallCmd: String;
  ResultCode: Integer;
begin
  Result := True;
  // Rien de spécial pour le moment : l'install est idempotente côté silent-install.ps1.
  // Placeholder pour une future détection d'une vieille install majeure incompatible.
  UninstallCmd := '';
  ResultCode := 0;
end;

// ----------------------------------------------------------------------------
// Écran final : affiche l'URL à bookmarker sur les 4 postes cabinet.
// ----------------------------------------------------------------------------
procedure CurPageChanged(CurPageID: Integer);
var
  Msg: String;
  Ip: String;
begin
  if CurPageID = wpFinished then begin
    Ip := GetLanIp('');
    Msg :=
      'Installation terminée avec succès.' + #13#10#13#10 +
      'Le service Windows "{#ServiceName}" est actif et redémarre automatiquement au boot.' + #13#10#13#10 +
      'Pour les 4 postes du cabinet, créer un raccourci vers :' + #13#10 +
      '   http://' + Ip + ':{#Port}/' + #13#10#13#10 +
      'Un raccourci .url a été placé dans :' + #13#10 +
      '   ' + ExpandConstant('{app}\Raccourci-postes-cabinet\') + #13#10#13#10 +
      'Copier ce fichier sur le bureau des 4 postes (clé USB, partage SMB).';
    WizardForm.FinishedLabel.Caption := Msg;
  end;
end;
