[CmdletBinding()]
param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDirectory
$localRoot = Join-Path $projectRoot ".local"
$nodeDirectory = Join-Path $localRoot "node"
$nodeExecutable = Join-Path $nodeDirectory "node.exe"
$pnpmDirectory = Join-Path $localRoot "pnpm"
$pnpmEntry = Join-Path $pnpmDirectory "node_modules\pnpm\bin\pnpm.mjs"
$pnpmWrapper = Join-Path $localRoot "pnpm.cmd"
$markerPath = Join-Path $localRoot "toolchain.json"

$nodeVersion = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot ".node-version")).Trim()
$utf8 = New-Object System.Text.UTF8Encoding($false)
$packageManifest = [System.IO.File]::ReadAllText((Join-Path $projectRoot "package.json"), $utf8) | ConvertFrom-Json
$packageManager = [string]$packageManifest.packageManager
if ($packageManager -notmatch '^pnpm@(?<version>[0-9]+\.[0-9]+\.[0-9]+)$') {
  throw "packageManager must use the pnpm@x.y.z format."
}
$pnpmVersion = $Matches.version

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
switch ($architecture) {
  "X64" {
    $nodeArchitecture = "x64"
    $nodeChecksum = "877cb93829e14fffbbc7903e7d8037336c9a79f3ea43c5d0b8c2379b79da56de"
  }
  "Arm64" {
    $nodeArchitecture = "arm64"
    $nodeChecksum = "d0722fcdefa1c08e4af31809e91ad4f23282f6c535c261607e8aa372d0ce61dd"
  }
  default {
    throw "Unsupported Windows architecture: $architecture"
  }
}

function Test-Toolchain {
  if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) { return $false }
  if (-not (Test-Path -LiteralPath $pnpmEntry -PathType Leaf)) { return $false }
  if (-not (Test-Path -LiteralPath $pnpmWrapper -PathType Leaf)) { return $false }
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { return $false }

  try {
    $nodeActual = (& $nodeExecutable --version 2>$null).Trim()
    $pnpmActual = (& $nodeExecutable $pnpmEntry --version 2>$null).Trim()
    $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    return (
      $nodeActual -eq "v$nodeVersion" -and
      $pnpmActual -eq $pnpmVersion -and
      [string]$marker.node -eq $nodeVersion -and
      [string]$marker.pnpm -eq $pnpmVersion -and
      [string]$marker.architecture -eq $nodeArchitecture
    )
  } catch {
    return $false
  }
}

function Assert-UnderLocal([string]$Path) {
  $resolvedLocal = [System.IO.Path]::GetFullPath($localRoot).TrimEnd('\') + '\'
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedLocal, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside .local: $resolvedPath"
  }
}

function Remove-LocalPath([string]$Path) {
  Assert-UnderLocal $Path
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -Recurse -Force -LiteralPath $Path
  }
}

if (-not $Force -and (Test-Toolchain)) {
  exit 0
}

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null

$archiveName = "node-v$nodeVersion-win-$nodeArchitecture.zip"
$downloadUrl = "https://nodejs.org/dist/v$nodeVersion/$archiveName"
$archivePath = Join-Path $localRoot $archiveName
$extractRoot = Join-Path $localRoot ".node-extract"
$extractedDirectory = Join-Path $extractRoot "node-v$nodeVersion-win-$nodeArchitecture"

Write-Host "Preparing project-local Node.js v$nodeVersion ($nodeArchitecture)..."
Remove-LocalPath $extractRoot
if (Test-Path -LiteralPath $archivePath) { Remove-Item -Force -LiteralPath $archivePath }
Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $archivePath

$archiveStream = [System.IO.File]::OpenRead($archivePath)
try {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash($archiveStream)
    $actualChecksum = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
} finally {
  $archiveStream.Dispose()
}
if ($actualChecksum -ne $nodeChecksum) {
  Remove-Item -Force -LiteralPath $archivePath
  throw "Node.js SHA-256 verification failed."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
[System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $extractRoot)
if (-not (Test-Path -LiteralPath (Join-Path $extractedDirectory "node.exe") -PathType Leaf)) {
  throw "Unexpected Node.js archive layout."
}

Remove-LocalPath $nodeDirectory
Move-Item -LiteralPath $extractedDirectory -Destination $nodeDirectory
Remove-LocalPath $extractRoot
Remove-Item -Force -LiteralPath $archivePath

$npmCli = Join-Path $nodeDirectory "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) {
  throw "npm was not found in the local Node.js distribution."
}

Write-Host "Preparing project-local pnpm $pnpmVersion..."
Remove-LocalPath $pnpmDirectory
New-Item -ItemType Directory -Force -Path $pnpmDirectory | Out-Null
& $nodeExecutable $npmCli install --prefix $pnpmDirectory --no-save --no-package-lock --ignore-scripts --no-audit --no-fund "pnpm@$pnpmVersion"
if ($LASTEXITCODE -ne 0) { throw "pnpm installation failed." }
if (-not (Test-Path -LiteralPath $pnpmEntry -PathType Leaf)) {
  throw "pnpm entry file was not found after installation."
}

$wrapperText = @"
@echo off
setlocal
set "PATH=%~dp0node;%PATH%"
set "pnpm_config_pm_on_fail=ignore"
set "pnpm_config_store_dir=%~dp0pnpm-store"
set "pnpm_config_virtual_store_dir=%~dp0..\node_modules\.pnpm"
"%~dp0node\node.exe" "%~dp0pnpm\node_modules\pnpm\bin\pnpm.mjs" %*
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $pnpmWrapper -Value $wrapperText -Encoding ascii -NoNewline

$marker = [ordered]@{
  node = $nodeVersion
  pnpm = $pnpmVersion
  architecture = $nodeArchitecture
  nodeSource = $downloadUrl
}
Set-Content -LiteralPath $markerPath -Value ($marker | ConvertTo-Json) -Encoding utf8 -NoNewline

if (-not (Test-Toolchain)) {
  throw "Toolchain verification failed after installation."
}

Write-Host "Project-local toolchain is ready."