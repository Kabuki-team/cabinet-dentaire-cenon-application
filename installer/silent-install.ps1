# Appelé par l'installeur Inno Setup au moment de l'installation.
# Fait tout le travail "système" : écrit .env, crée le service NSSM, ouvre le firewall,
# plante la tâche planifiée de backup, démarre le service.
#
# Paramètres passés par Inno Setup via /Parameters.

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)] [string]$InstallDir,
    [Parameter(Mandatory=$true)] [string]$OfficeToken,
    [int]   $Port        = 3000,
    [string]$ServiceName = 'CabinetCenonAPI'
)

$ErrorActionPreference = 'Stop'

# Chemins dérivés
$NodeExe        = Join-Path $InstallDir 'node\node.exe'
$NssmExe        = Join-Path $InstallDir 'bin\nssm.exe'
$ServerDir      = Join-Path $InstallDir 'server'
$ServerScript   = Join-Path $ServerDir 'dist\server.js'
$EnvFile        = Join-Path $ServerDir '.env'
$DataDir        = Join-Path $InstallDir 'data'
$LogsDir        = Join-Path $InstallDir 'logs'
$BackupsDir     = Join-Path $InstallDir 'backups'
$BackupScript   = Join-Path $ServerDir 'scripts\backup.ps1'

Write-Host "=== Cabinet Cenon — Installation du service ==="
Write-Host "InstallDir : $InstallDir"
Write-Host "Port       : $Port"
Write-Host "Service    : $ServiceName"

# 1. Vérifications basiques
if (-not (Test-Path $NodeExe))      { throw "node.exe introuvable : $NodeExe" }
if (-not (Test-Path $NssmExe))      { throw "nssm.exe introuvable : $NssmExe" }
if (-not (Test-Path $ServerScript)) { throw "server.js introuvable : $ServerScript" }

# 2. Écrire le .env (en UTF-8 sans BOM — Node.js --env-file attend ce format)
Write-Host ""
Write-Host "[1/6] Écriture de $EnvFile..."
$envLines = @(
    "# Généré automatiquement par l'installeur Cabinet Cenon — ne pas commiter.",
    "# Pour modifier manuellement, arrêter le service puis éditer, puis redémarrer.",
    "PORT=$Port",
    "HOST=0.0.0.0",
    "OFFICE_TOKEN=$OfficeToken",
    "DB_PATH=$DataDir\cenon.db",
    "STATIC_DIR=..\dist",
    "LOG_LEVEL=info"
)
# Out-File par défaut écrit en UTF-16 ; forcer UTF-8 sans BOM
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($EnvFile, ($envLines -join [Environment]::NewLine), $enc)

# 3. Service Windows via NSSM (idempotent)
Write-Host "[2/6] Configuration du service NSSM..."
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Service existant détecté, arrêt et reconfiguration..."
    & $NssmExe stop $ServiceName confirm 2>&1 | Out-Null
} else {
    & $NssmExe install $ServiceName $NodeExe $ServerScript | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "nssm install a échoué" }
}

& $NssmExe set $ServiceName Application          $NodeExe                                  | Out-Null
& $NssmExe set $ServiceName AppParameters        "--env-file=""$EnvFile"" ""$ServerScript""" | Out-Null
& $NssmExe set $ServiceName AppDirectory         $ServerDir                                | Out-Null
& $NssmExe set $ServiceName AppStdout            (Join-Path $LogsDir 'api-stdout.log')     | Out-Null
& $NssmExe set $ServiceName AppStderr            (Join-Path $LogsDir 'api-stderr.log')     | Out-Null
& $NssmExe set $ServiceName AppRotateFiles       1                                         | Out-Null
& $NssmExe set $ServiceName AppRotateOnline      1                                         | Out-Null
& $NssmExe set $ServiceName AppRotateBytes       10485760                                   | Out-Null
& $NssmExe set $ServiceName AppEnvironmentExtra  "NODE_ENV=production"                      | Out-Null
& $NssmExe set $ServiceName Start                SERVICE_AUTO_START                         | Out-Null
& $NssmExe set $ServiceName AppExit Default      Restart                                    | Out-Null
& $NssmExe set $ServiceName AppRestartDelay      5000                                       | Out-Null
& $NssmExe set $ServiceName Description          'Cabinet Dentaire Cenon — API backend (Phase 1)' | Out-Null
& $NssmExe set $ServiceName DisplayName          'Cabinet Cenon API'                        | Out-Null

# 4. Pare-feu Windows (profil Privé uniquement, LAN cabinet)
Write-Host "[3/6] Configuration du pare-feu Windows (port $Port / Privé)..."
$ruleName = 'Cabinet Cenon API'
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile Private `
    -Description 'Autorise les postes cabinet à joindre le backend sur le LAN privé' | Out-Null

# 5. Tâche planifiée de backup quotidien à 23h
Write-Host "[4/6] Planification du backup quotidien à 23h..."
if (Test-Path $BackupScript) {
    $taskName = 'CabinetCenon-BackupQuotidien'
    $taskAction = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$BackupScript`" -DbPath `"$DataDir\cenon.db`" -BackupDir `"$BackupsDir`""
    $taskTrigger = New-ScheduledTaskTrigger -Daily -At '23:00'
    $taskSettings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $taskAction `
        -Trigger $taskTrigger `
        -Settings $taskSettings `
        -Principal $taskPrincipal `
        -Description 'Backup quotidien SQLite du Cabinet Cenon (rotation 30 jours).' | Out-Null
} else {
    Write-Warning "  backup.ps1 introuvable, skip. Planification backup à faire manuellement."
}

# 6. Démarrage du service + health check
Write-Host "[5/6] Démarrage du service..."
& $NssmExe start $ServiceName | Out-Null
Start-Sleep -Seconds 4

$status = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status
Write-Host "  Statut : $status"

Write-Host "[6/6] Health check..."
$retries = 5
$ok = $false
for ($i = 1; $i -le $retries; $i++) {
    try {
        $resp = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" `
            -Headers @{ 'X-Office-Token' = $OfficeToken } `
            -TimeoutSec 3
        if ($resp.status -eq 'ok') { $ok = $true; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($ok) {
    Write-Host "  API répond OK (version $($resp.version), node $($resp.node))."
} else {
    Write-Warning "  L'API n'a pas répondu après $retries tentatives. Vérifier $LogsDir\api-stderr.log"
}

Write-Host ""
Write-Host "=== Installation du service terminée ==="
