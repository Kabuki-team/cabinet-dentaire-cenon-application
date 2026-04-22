# Mise à jour du serveur Cabinet Cenon sans perdre les données.
#
# Procédure : arrête le service, écrase le code source avec le nouveau build
# (fourni dans un dossier source à côté), relance le service.
#
# Utilisation (PowerShell Administrateur) :
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\update-service.ps1 -NewSourceDir C:\Temp\cabinet-cenon-server-v0.2.0

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)] [string]$NewSourceDir,
    [string]$ServiceName  = 'CabinetCenonAPI',
    [string]$InstallDir   = 'C:\Cabinet\server'
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($current)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Administrator)) { throw "Lancer ce script en Administrateur." }

if (-not (Test-Path $NewSourceDir)) { throw "Source de mise à jour introuvable : $NewSourceDir" }
if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { throw "Le service $ServiceName n'existe pas. Lancer install-service.ps1 d'abord." }

# 1. Backup automatique avant mise à jour
Write-Host "[1/4] Backup de sécurité avant mise à jour..." -ForegroundColor Cyan
$backupScript = Join-Path $PSScriptRoot 'backup.ps1'
if (Test-Path $backupScript) {
    & $backupScript -Tag "pre-update-$(Get-Date -Format yyyyMMdd-HHmmss)"
} else {
    Write-Warning "backup.ps1 introuvable, skip. Lancer manuellement un backup si souhaité."
}

# 2. Stop du service
Write-Host "[2/4] Arrêt du service $ServiceName..." -ForegroundColor Cyan
& nssm stop $ServiceName confirm 2>&1 | Out-Null
Start-Sleep -Seconds 2

# 3. Remplacer les fichiers source + node_modules + dist
Write-Host "[3/4] Remplacement des fichiers dans $InstallDir..." -ForegroundColor Cyan
$protected = @('.env', 'data', 'logs')  # à préserver
foreach ($item in Get-ChildItem $InstallDir -Force) {
    if ($protected -notcontains $item.Name) {
        Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}
foreach ($item in Get-ChildItem $NewSourceDir -Force) {
    if ($protected -notcontains $item.Name) {
        Copy-Item $item.FullName $InstallDir -Recurse -Force
    }
}

# 4. npm install + build + redémarrage
Write-Host "[4/4] npm install + build + démarrage..." -ForegroundColor Cyan
Push-Location $InstallDir
try {
    & npm install --no-audit --no-fund 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "npm install a échoué" }
    & npm run build 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "npm run build a échoué" }
} finally {
    Pop-Location
}

& nssm start $ServiceName
Start-Sleep -Seconds 2
$status = (Get-Service -Name $ServiceName).Status

Write-Host ""
Write-Host "=== Mise à jour terminée ===" -ForegroundColor Green
Write-Host "Statut service : $status"
Write-Host "Vérifier avec : curl http://localhost:3000/api/health -H `"X-Office-Token: <token>`""
