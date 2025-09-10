Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Wrapper that forwards all args to the inner script under tag-painter/scripts/start.ps1
$inner = Join-Path $PSScriptRoot 'tag-painter\scripts\start.ps1'
if (-not (Test-Path $inner)) {
  Write-Error "Inner start script not found: $inner"
  exit 1
}

& $inner @args
