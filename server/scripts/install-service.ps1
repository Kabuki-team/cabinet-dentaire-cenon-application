# Installation du service Windows "CabinetCenonAPI" sur le PC serveur (secrétariat).
#
# Prérequis (à installer AVANT ce script) :
#   - Node.js LTS 22+  (https://nodejs.org/ ; choisir l'installeur MSI "LTS")
#   - NSSM 2.24+       (https://nssm.cc/download ; copier nssm.exe dans C:\Windows\System32)
#
# Utilisation (PowerShell en Administrateur) :
#   Set-ExecutionPolicy -Scope Process Bypass
#   cd C:\Cabinet\server
#   .\scripts\install-service.ps1
#
# Le script est idempotent : relancer met à jour le service sans perdre la base.

[CmdletBinding()]
param(
    [string]$ServiceName = 'CabinetCenonAPI',
    [string]$InstallDir  = 'C:\Cabinet\server',
    [string]$DataDir     = 'C:\Cabinet\data',
    [string]$LogDir      = 'C:\Cabinet\logs',
    [int]   $Port        = 3000,
    [string]$EnvFile     = 'C:\Cabinet\server\.env'
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    throw "Ce script doit être lancé en tant qu'Administrateur."
}

# 1. Vérifier les prérequis
Write-Host "[1/7] Vérification des prérequis..." -ForegroundColor Cyan
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeExe) { throw "Node.js introuvable dans le PATH. Installer depuis https://nodejs.org/" }
$nodeVersion = & node --version
Write-Host "  Node.js    : $nodeVersion ($nodeExe)"

$nssmExe = (Get-Command nssm -ErrorAction SilentlyContinue)?.Source
if (-not $nssmExe) { throw "NSSM introuvable. Télécharger depuis https://nssm.cc/download et placer nssm.exe dans C:\Windows\System32" }
Write-Host "  NSSM       : OK ($nssmExe)"

if (-not (Test-Path $InstallDir)) { throw "InstallDir introuvable : $InstallDir. Copier le dossier `server/` ici d'abord." }
if (-not (Test-Path "$InstallDir\dist\server.js") -and -not (Test-Path "$InstallDir\src\server.ts")) {
    throw "Le dossier $InstallDir ne contient ni dist\server.js ni src\server.ts. Vérifier que le build a été copié."
}

# 2. Créer les dossiers data/logs
Write-Host "[2/7] Création des dossiers data et logs..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir  | Out-Null
Write-Host "  $DataDir : OK"
Write-Host "  $LogDir  : OK"

# 3. Vérifier le .env
Write-Host "[3/7] Vérification de $EnvFile..." -ForegroundColor Cyan
if (-not (Test-Path $EnvFile)) {
    $example = Join-Path $InstallDir '.env.example'
    if (Test-Path $example) {
        Copy-Item $example $EnvFile
        Write-Warning "  .env créé à partir de .env.example. Éditer maintenant, en particulier OFFICE_TOKEN."
        Write-Warning "  Générer un token avec : openssl rand -hex 32  (ou Get-Random côté PowerShell)."
        throw "Arrêt : éditer $EnvFile puis relancer ce script."
    } else {
        throw ".env introuvable et .env.example absent. Impossible de continuer."
    }
}
$envContent = Get-Content $EnvFile -Raw
if ($envContent -match 'changeme-generate-with-openssl') {
    throw "OFFICE_TOKEN non modifié dans .env. Remplacer la valeur par un token robuste."
}
Write-Host "  .env       : OK"

# 4. Installer les dépendances npm (avec devDeps pour permettre le build TypeScript)
Write-Host "[4/7] npm install dans $InstallDir..." -ForegroundColor Cyan
Push-Location $InstallDir
try {
    & npm install --no-audit --no-fund 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "npm install a échoué (exit $LASTEXITCODE)" }

    # Build TypeScript si dist/ absent ou si src/ a été modifié plus récemment
    $buildNeeded = $true
    if (Test-Path "$InstallDir\dist\server.js") {
        $distTime = (Get-Item "$InstallDir\dist\server.js").LastWriteTime
        $srcLatest = (Get-ChildItem "$InstallDir\src" -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        if ($distTime -gt $srcLatest) { $buildNeeded = $false }
    }
    if ($buildNeeded) {
        Write-Host "[5/7] Build TypeScript..." -ForegroundColor Cyan
        & npm run build 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) { throw "npm run build a échoué" }
    } else {
        Write-Host "[5/7] dist/server.js à jour, skip build." -ForegroundColor Cyan
    }
} finally {
    Pop-Location
}

# 6. Installer / reconfigurer le service NSSM
Write-Host "[6/7] Configuration du service NSSM '$ServiceName'..." -ForegroundColor Cyan
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Service existant détecté, arrêt et reconfiguration..."
    & nssm stop $ServiceName confirm 2>&1 | Out-Null
} else {
    & nssm install $ServiceName $nodeExe "$InstallDir\dist\server.js"
    if ($LASTEXITCODE -ne 0) { throw "nssm install a échoué" }
}
& nssm set $ServiceName AppDirectory          $InstallDir
& nssm set $ServiceName AppStdout             "$LogDir\api-stdout.log"
& nssm set $ServiceName AppStderr             "$LogDir\api-stderr.log"
& nssm set $ServiceName AppRotateFiles        1
& nssm set $ServiceName AppRotateOnline       1
& nssm set $ServiceName AppRotateBytes        10485760   # 10 Mo
& nssm set $ServiceName AppEnvironmentExtra   "NODE_ENV=production"
& nssm set $ServiceName AppParameters         "--env-file=$EnvFile $InstallDir\dist\server.js"
& nssm set $ServiceName Application           $nodeExe
& nssm set $ServiceName Start                 SERVICE_AUTO_START
& nssm set $ServiceName AppExit Default       Restart
& nssm set $ServiceName AppRestartDelay       5000
& nssm set $ServiceName Description           'Cabinet Dentaire Cenon — API backend (Phase 1)'

# 7. Ouvrir le port dans le firewall Windows (LAN uniquement)
Write-Host "[7/7] Configuration du pare-feu Windows..." -ForegroundColor Cyan
$ruleName = 'Cabinet Cenon API'
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile Private `
    -Description 'Autorise les postes cabinet à joindre l''API sur le LAN privé' | Out-Null
Write-Host "  Règle '$ruleName' : port $Port TCP, profil Private"

# Démarrer le service
& nssm start $ServiceName
Start-Sleep -Seconds 2

$status = (Get-Service -Name $ServiceName).Status
Write-Host ""
Write-Host "=== Installation terminée ===" -ForegroundColor Green
Write-Host "Service      : $ServiceName"
Write-Host "Statut       : $status"
Write-Host "Port         : $Port"
Write-Host "Data dir     : $DataDir"
Write-Host "Logs         : $LogDir"
Write-Host ""
Write-Host "Tester : curl http://localhost:$Port/api/health -H `"X-Office-Token: <token>`"" -ForegroundColor Yellow
