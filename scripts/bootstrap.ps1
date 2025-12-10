param(
  [string]$NodeVersion = "24.11.1",
  [string]$NodeZipUrl = "https://nodejs.org/dist/v24.11.1/node-v24.11.1-win-x64.zip",
  [switch]$SkipNode
)

<#
  Windows bootstrap script
  - Installs portable Git (MinGit) if system Git is not available
  - Installs Node v$NodeVersion locally (portable) if not available
  - ComfyUI installation is now handled via scripts/install-comfy.ps1 or the in-app setup dialog

  Usage examples:
    pwsh -File scripts/bootstrap.ps1
    pwsh -File scripts/bootstrap.ps1 -SkipNode

  Notes:
  - If you prefer your system Node, pass -SkipNode
  - After running bootstrap, run scripts/install-comfy.ps1 (or use the app) to install ComfyUI
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Header($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function New-DirectoryIfMissing($path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}

function Save-UrlIfMissing($url, $destPath) {
  if (Test-Path $destPath) { return }
  Write-Host "Downloading: $url" -ForegroundColor DarkCyan
  try {
    Invoke-WebRequest -Uri $url -OutFile $destPath -Headers @{ 'User-Agent' = 'Mozilla/5.0' } -MaximumRedirection 10
    if ((Test-Path $destPath) -and (Get-Item $destPath).Length -gt 0) { return }
  } catch {}
  try {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -A "Mozilla/5.0" -L "$url" -o "$destPath"
      if ((Test-Path $destPath) -and (Get-Item $destPath).Length -gt 0) { return }
    }
  } catch {}
  throw "Failed to download $url"
}


function Expand-Zip-To($archivePath, $destDir) {
  Write-Host "Extracting: $archivePath -> $destDir" -ForegroundColor DarkCyan
  if (Test-Path $destDir) { Remove-Item -Recurse -Force $destDir }
  Expand-Archive -Path $archivePath -DestinationPath $destDir -Force
}

function Install-Node($vendorDir) {
  if ($SkipNode) {
    Write-Host "Skipping Node setup (SkipNode)." -ForegroundColor Yellow
    return $null
  }

  Write-Header "Node.js $NodeVersion"

  $systemNode = $null
  try {
    $ver = (node -v) 2>$null
    if ($ver -and $ver.Trim() -eq "v$NodeVersion") { $systemNode = "node" }
  } catch {}

  if ($systemNode) {
    Write-Host "Using system Node $ver" -ForegroundColor Green
    return $null
  }

  $nodeZip = Join-Path $vendorDir "node.zip"
  $nodeExtractDir = Join-Path $vendorDir "node-extract"
  $nodeHome = Join-Path $vendorDir "node"

  Save-UrlIfMissing $NodeZipUrl $nodeZip
  Expand-Zip-To $nodeZip $nodeExtractDir

  # Move extracted folder to vendor\node for a stable path
  if (Test-Path $nodeHome) { Remove-Item -Recurse -Force $nodeHome }
  $sub = Get-ChildItem -Path $nodeExtractDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1
  if (-not $sub) { throw "Could not locate extracted Node folder under $nodeExtractDir" }
  Move-Item -Path $sub.FullName -Destination $nodeHome
  Remove-Item -Recurse -Force $nodeExtractDir

  return $nodeHome
}

# Main
Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  New-DirectoryIfMissing "vendor"

  $nodeHome = Install-Node -vendorDir (Resolve-Path "vendor")
} finally {
  Pop-Location
}
 
