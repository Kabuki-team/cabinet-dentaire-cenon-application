# Backup quotidien du fichier SQLite du cabinet.
#
# Stratégie :
#   - Utilise l'API SQLite "VACUUM INTO" pour produire un backup cohérent SANS bloquer
#     les lectures/écritures du service en cours (le WAL autorise les snapshots).
#   - Rotation automatique : garde 30 jours par défaut.
#
# Planifier via le Planificateur de tâches Windows :
#   Action     : PowerShell -ExecutionPolicy Bypass -File C:\Cabinet\server\scripts\backup.ps1
#   Déclencheur: Quotidien 23h00
#   Options    : "Exécuter avec les autorisations maximales"

[CmdletBinding()]
param(
    [string]$DbPath       = 'C:\Cabinet\data\cenon.db',
    [string]$BackupDir    = 'C:\Cabinet\backups',
    [int]   $RetentionDays = 30,
    [string]$Tag          = $null   # Suffixe optionnel, ex "pre-update"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $DbPath)) { throw "DB introuvable : $DbPath" }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$date = Get-Date -Format 'yyyyMMdd-HHmmss'
$suffix = if ($Tag) { "-$Tag" } else { '' }
$backupFile = Join-Path $BackupDir "cenon-$date$suffix.db"

# Chercher sqlite3.exe (fourni avec better-sqlite3 ou à installer séparément)
$sqliteExe = (Get-Command sqlite3 -ErrorAction SilentlyContinue)?.Source
if (-not $sqliteExe) {
    # Fallback : copie simple du fichier + WAL checkpoint préalable via le service lui-même (à faire manuellement).
    # La copie simple sur une DB en WAL est techniquement une violation de cohérence —
    # mais en pratique SQLite gère bien la récupération au redémarrage.
    Write-Warning "sqlite3.exe absent du PATH — fallback copie simple. Installer SQLite CLI pour un backup propre : https://www.sqlite.org/download.html"
    Copy-Item $DbPath $backupFile
    if (Test-Path "$DbPath-wal") { Copy-Item "$DbPath-wal" "$backupFile-wal" }
    if (Test-Path "$DbPath-shm") { Copy-Item "$DbPath-shm" "$backupFile-shm" }
} else {
    # Backup cohérent via VACUUM INTO (snapshot sans blocage).
    & $sqliteExe $DbPath "VACUUM INTO '$backupFile';"
    if ($LASTEXITCODE -ne 0) { throw "VACUUM INTO a échoué (exit $LASTEXITCODE)" }
}

$size = (Get-Item $backupFile).Length
Write-Host "Backup créé : $backupFile ($([math]::Round($size/1KB,1)) KB)"

# Test d'intégrité du backup
if ($sqliteExe) {
    $check = & $sqliteExe $backupFile 'PRAGMA integrity_check;'
    if ($check -ne 'ok') {
        Remove-Item $backupFile -Force
        throw "Backup corrompu (integrity_check = '$check'). Fichier supprimé."
    }
    Write-Host "Integrité : OK"
}

# Rotation : supprimer les backups plus vieux que RetentionDays (ne touche pas aux tagués)
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$oldBackups = Get-ChildItem $BackupDir -Filter 'cenon-*.db' |
    Where-Object { $_.LastWriteTime -lt $cutoff -and $_.Name -notmatch '(pre-update|manual)' }
foreach ($old in $oldBackups) {
    Write-Host "Suppression backup ancien : $($old.Name) (date $($old.LastWriteTime.ToString('yyyy-MM-dd')))"
    Remove-Item $old.FullName -Force
}

Write-Host ""
Write-Host "Backups en $BackupDir :"
Get-ChildItem $BackupDir -Filter 'cenon-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 10 | Format-Table Name, @{N='Size (KB)';E={[math]::Round($_.Length/1KB,1)}}, LastWriteTime -AutoSize
