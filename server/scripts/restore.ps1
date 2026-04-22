# Restauration d'un backup SQLite.
#
# ATTENTION : écrase la base actuelle. Un backup "rollback-YYYYMMDD-HHMMSS.db" est créé
# de la base actuelle AVANT remplacement, au cas où.
#
# Utilisation (PowerShell Administrateur) :
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\restore.ps1 -BackupFile C:\Cabinet\backups\cenon-20260420-230000.db

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)] [string]$BackupFile,
    [string]$DbPath      = 'C:\Cabinet\data\cenon.db',
    [string]$BackupDir   = 'C:\Cabinet\backups',
    [string]$ServiceName = 'CabinetCenonAPI'
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($current)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Administrator)) { throw "Lancer ce script en Administrateur." }

if (-not (Test-Path $BackupFile)) { throw "Backup introuvable : $BackupFile" }

# Vérifier que c'est bien un fichier SQLite
$header = [System.IO.File]::ReadAllBytes($BackupFile)[0..14]
$magic = [System.Text.Encoding]::ASCII.GetString($header)
if ($magic -ne 'SQLite format 3') {
    throw "Le fichier ne ressemble pas à une base SQLite (magic=$magic)."
}

# Intégrité du backup avant restauration (sécurité)
$sqliteExe = (Get-Command sqlite3 -ErrorAction SilentlyContinue)?.Source
if ($sqliteExe) {
    $check = & $sqliteExe $BackupFile 'PRAGMA integrity_check;'
    if ($check -ne 'ok') { throw "Le backup n'est pas cohérent (integrity_check=$check). Abandon." }
    Write-Host "Intégrité backup : OK"
}

# 1. Arrêter le service
Write-Host "[1/4] Arrêt du service $ServiceName..." -ForegroundColor Cyan
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    & nssm stop $ServiceName confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# 2. Sauvegarder l'état actuel (rollback)
Write-Host "[2/4] Sauvegarde de l'état actuel avant restauration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$rollbackFile = Join-Path $BackupDir ("rollback-$(Get-Date -Format yyyyMMdd-HHmmss).db")
if (Test-Path $DbPath) {
    Copy-Item $DbPath $rollbackFile
    Write-Host "  État actuel copié vers $rollbackFile"
} else {
    Write-Host "  Pas de DB actuelle à sauvegarder."
}

# 3. Remplacer la DB
Write-Host "[3/4] Remplacement de $DbPath par $BackupFile..." -ForegroundColor Cyan
Remove-Item "$DbPath*" -Force -ErrorAction SilentlyContinue   # .db-wal, .db-shm, etc.
Copy-Item $BackupFile $DbPath

# 4. Relancer le service
Write-Host "[4/4] Démarrage du service $ServiceName..." -ForegroundColor Cyan
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    & nssm start $ServiceName
    Start-Sleep -Seconds 2
    $status = (Get-Service -Name $ServiceName).Status
    Write-Host "  Statut : $status"
}

Write-Host ""
Write-Host "=== Restauration terminée ===" -ForegroundColor Green
Write-Host "Base restaurée depuis : $BackupFile"
Write-Host "Rollback disponible   : $rollbackFile"
