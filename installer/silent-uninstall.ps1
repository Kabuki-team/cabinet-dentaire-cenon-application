# Appelé par Inno Setup pendant la désinstallation.
# Supprime le service Windows, la règle firewall et la tâche planifiée de backup.
# PRÉSERVE les données (data\, logs\, backups\) — l'utilisateur les supprime manuellement si souhaité.

[CmdletBinding()]
param(
    [string]$ServiceName = 'CabinetCenonAPI'
)

$ErrorActionPreference = 'Continue'

Write-Host "=== Cabinet Cenon — Désinstallation du service ==="

# On utilise nssm.exe bundled si disponible, sinon le PATH
$NssmExe = 'nssm.exe'
$bundledNssm = Join-Path $PSScriptRoot '..\bin\nssm.exe'
if (Test-Path $bundledNssm) { $NssmExe = (Resolve-Path $bundledNssm).Path }

# 1. Stop + remove service
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Arrêt du service $ServiceName..."
    & $NssmExe stop $ServiceName confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2

    Write-Host "Suppression du service $ServiceName..."
    & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
} else {
    Write-Host "Aucun service $ServiceName à supprimer."
}

# 2. Remove firewall rule
Write-Host "Suppression de la règle firewall 'Cabinet Cenon API'..."
Remove-NetFirewallRule -DisplayName 'Cabinet Cenon API' -ErrorAction SilentlyContinue

# 3. Remove scheduled task
Write-Host "Suppression de la tâche planifiée 'CabinetCenon-BackupQuotidien'..."
Unregister-ScheduledTask -TaskName 'CabinetCenon-BackupQuotidien' -Confirm:$false -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Désinstallation du service terminée ==="
Write-Host "Les données (data\, logs\, backups\) sont conservées — supprimer manuellement si souhaité."
