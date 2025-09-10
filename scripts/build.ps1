param(
  [string]$NodeVersion = "22.19.0"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Install-Node($version) {
  $vendorPath = Join-Path (Get-Location) "vendor"
  if (-not (Test-Path $vendorPath)) { New-Item -ItemType Directory -Path $vendorPath | Out-Null }
  $vendor = Resolve-Path $vendorPath
  try {
    $ver = (node -v) 2>$null
    if ($ver -and $ver.Trim() -eq "v$version") { return $null }
  } catch {}
  $zip = Join-Path $vendor "node.zip"
  $url = "https://nodejs.org/dist/v$version/node-v$version-win-x64.zip"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  $extract = Join-Path $vendor "node-extract"
  if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $sub = Get-ChildItem -Path $extract | Where-Object { $_.PSIsContainer } | Select-Object -First 1
  $nodeHomeDir = Join-Path $vendor "node"
  if (Test-Path $nodeHomeDir) { Remove-Item -Recurse -Force $nodeHomeDir }
  Move-Item $sub.FullName $nodeHomeDir
  Remove-Item -Recurse -Force $extract
  return $nodeHomeDir
}

function Invoke-Npm($nodeHome, $npmArgs) {
  if ($nodeHome) { & (Join-Path $nodeHome "npm.cmd") @npmArgs } else { & npm @npmArgs }
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  $nodeHome = Install-Node -version $NodeVersion
  Invoke-Npm $nodeHome @("ci")
  if ($LASTEXITCODE -ne 0) { Invoke-Npm $nodeHome @("install") }
  Invoke-Npm $nodeHome @("run", "build")
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }
  Write-Host "Build completed. Output in build/" -ForegroundColor Green
} finally {
  Pop-Location
}
