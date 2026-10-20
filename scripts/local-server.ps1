[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop", "status")]
  [string]$Action
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$localRoot = Join-Path $projectRoot ".local"
$nodeExecutable = Join-Path $localRoot "node\node.exe"
$serverEntry = Join-Path $projectRoot "scripts\dev.mjs"
$statePath = Join-Path $localRoot "server-state.json"
$stdoutPath = Join-Path $localRoot "server.stdout.log"
$stderrPath = Join-Path $localRoot "server.stderr.log"
$serverPort = if ($env:PORT) { [int]$env:PORT } else { 8000 }
$previewUrl = "http://127.0.0.1:$serverPort/"
$adminUrl = $previewUrl + "__admin/"

function Get-OwnedServer {
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { return $null }
  try {
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    $serverProcessId = [int]$state.processId
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId"
    if ($null -eq $serverProcess) { return $null }
    if ($serverProcess.ExecutablePath -ne $nodeExecutable) { return $null }
    if (-not $serverProcess.CommandLine.Contains($serverEntry)) { return $null }
    return $serverProcess
  } catch {
    return $null
  }
}

function Get-ServerListener {
  return Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $serverPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Test-ServerReady([int]$ServerProcessId) {
  $listener = Get-ServerListener
  if ($null -eq $listener -or $listener.OwningProcess -ne $ServerProcessId) { return $false }
  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $adminUrl -TimeoutSec 2).StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  $ownedServer = Get-OwnedServer
  if ($Action -eq "stop") {
    if ($null -ne $ownedServer) {
      Stop-Process -Id $ownedServer.ProcessId -ErrorAction Stop
      Write-Host "Background server stopped."
    } else {
      Write-Host "No background server started by this repository is running."
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath -Force }
    exit 0
  }

  if ($Action -eq "status") {
    if ($null -ne $ownedServer -and (Test-ServerReady $ownedServer.ProcessId)) {
      Write-Host "Background server running (PID $($ownedServer.ProcessId))."
      Write-Host "Public preview: $previewUrl"
      Write-Host "Local admin:   $adminUrl"
    } else {
      Write-Host "Background server is not ready. Run site.cmd start."
    }
    exit 0
  }

  if ($null -ne $ownedServer) {
    if (-not (Test-ServerReady $ownedServer.ProcessId)) {
      throw "The background process is not ready. Check .local/server.stderr.log, then run site.cmd stop and site.cmd start."
    }
    Write-Host "Background server already running (PID $($ownedServer.ProcessId))."
    Write-Host "Local admin: $adminUrl"
    exit 0
  }

  if ($null -ne (Get-ServerListener)) {
    throw "Port $serverPort is already in use. Stop the existing foreground preview before running site.cmd start."
  }
  if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw "Project-local Node.js is missing. Run site.cmd setup first."
  }

  New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
  $startedServer = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $serverEntry + '"') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  @{ processId = $startedServer.Id } | ConvertTo-Json |
    Set-Content -LiteralPath $statePath -Encoding UTF8

  $startupTimer = [System.Diagnostics.Stopwatch]::StartNew()
  while ($startupTimer.Elapsed.TotalSeconds -lt 30) {
    if ($startedServer.HasExited) { break }
    if (Test-ServerReady $startedServer.Id) {
      Write-Host "Background server started (PID $($startedServer.Id))."
      Write-Host "Public preview: $previewUrl"
      Write-Host "Local admin:   $adminUrl"
      Write-Host "Use site.cmd stop to stop it. Closing the terminal does not stop it."
      exit 0
    }
    Start-Sleep -Milliseconds 250
  }

  if ($null -ne (Get-OwnedServer)) { Stop-Process -Id $startedServer.Id -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $statePath -Force
  throw "The background server did not become ready. Check .local/server.stderr.log."
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
}
