$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$logDir = Join-Path $env:LOCALAPPDATA 'POSA'
$stdoutLog = Join-Path $logDir 'inference.log'
$stderrLog = Join-Path $logDir 'inference-error.log'

if (-not (Test-Path -LiteralPath $python)) {
  throw "Python environment not found: $python"
}

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8010/health' -TimeoutSec 2
  if ($health.ok) { exit 0 }
} catch {
  # Start the local API below when it is not already healthy.
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath $python `
  -ArgumentList @('-m', 'uvicorn', 'inference.service:app', '--host', '127.0.0.1', '--port', '8010') `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog
