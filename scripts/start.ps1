param(
  [int]$Port = 3000,
  [switch]$OpenBrowser,
  [switch]$Help
)

<#!
  Simplified start script.
  - Installs Node dependencies if missing
  - Starts the built Tag Painter server (build/index.js)
  - ComfyUI is now managed inside the application via the Setup dialog
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Show-Help {
  Write-Host "Tag Painter - Start Script" -ForegroundColor Cyan
  Write-Host "Starts the Tag Painter web application" -ForegroundColor White
  Write-Host "" 
  Write-Host "USAGE:" -ForegroundColor Yellow
  Write-Host "  .\\scripts\\start.ps1 [-Port <number>] [-OpenBrowser]" -ForegroundColor White
  Write-Host "" 
}

function Start-NodeServer($port) {
  if (-not (Test-Path "build\\index.js")) {
    Write-Host "Missing build output. Run 'npm run build' first." -ForegroundColor Yellow
    return $null
  }

  if (-not $env:PORT) { $env:PORT = "$port" }
  if (-not $env:NODE_ENV) { $env:NODE_ENV = "production" }

  $node = "node"
  if (Test-Path "vendor\\node\\node.exe") { $node = (Resolve-Path "vendor\\node\\node.exe") }

  Write-Host "Starting Tag Painter on http://127.0.0.1:$port ..." -ForegroundColor DarkCyan
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  $psi.Arguments = "build\\index.js"
  $psi.WorkingDirectory = (Resolve-Path ".")
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $false
  $psi.RedirectStandardError = $false
  $proc = [System.Diagnostics.Process]::Start($psi)
  return $proc
}

if ($Help) {
  Show-Help
  exit 0
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  if (-not (Test-Path "node_modules")) {
    Write-Host "Installing Node dependencies (npm ci)..." -ForegroundColor DarkCyan
    npm ci
  }

  $server = Start-NodeServer -port $Port
  if ($server -and $OpenBrowser) {
    Start-Process "http://127.0.0.1:$Port"
  }

  if ($server) {
    Write-Host "Server PID: $($server.Id)" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
    while ($true) { Start-Sleep -Seconds 3600 }
  } else {
    Write-Host "Server failed to start." -ForegroundColor Red
  }
} finally {
  Pop-Location
}
