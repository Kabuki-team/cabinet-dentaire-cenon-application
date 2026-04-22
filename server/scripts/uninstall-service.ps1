# Désinstallation du service Windows "CabinetCenonAPI".
#
# ATTENTION : supprime le service uniquement. Conserve les données (C:\Cabinet\data) et les logs.
# Pour tout effacer, supprimer manuellement C:\Cabinet après exécution.
#
# Utilisation (PowerShell Administrateur) :
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\uninstall-service.ps1

[CmdletBinding()]
param(
    [string]$ServiceName = 'CabinetCenonAPI',
    [int]   $Port        = 3000
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($current)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Administrator)) { throw "Lancer ce script en Administrateur." }

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Arrêt du service $ServiceName..." -ForegroundColor Cyan
    & nssm stop $ServiceName confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2

    Write-Host "Suppression du service $ServiceName..." -ForegroundColor Cyan
    & nssm remove $ServiceName confirm 2>&1 | Out-Null
} else {
    Write-Warning "Aucun service $ServiceName à supprimer."
}

Write-Host "Suppression de la règle pare-feu 'Cabinet Cenon API'..." -ForegroundColor Cyan
Remove-NetFirewallRule -DisplayName 'Cabinet Cenon API' -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Désinstallation terminée ===" -ForegroundColor Green
Write-Host "Les données (C:\Cabinet\data) et les logs (C:\Cabinet\logs) sont conservés."
Write-Host "Supprimer manuellement si souhaité."
