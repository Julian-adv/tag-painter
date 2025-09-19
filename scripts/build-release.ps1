param(
  [string]$OutFile = "tag-painter-release.zip",
  [switch]$NoBuild
)

<#
  Creates a lightweight release ZIP containing sources, scripts, and build output.
  Note: node_modules is not included. Consumers should run bootstrap scripts.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  # If using default output name, append version from package.json
  try {
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $ver = $pkg.version
    if ($ver -and $OutFile -eq "tag-painter-release.zip") {
      $OutFile = "tag-painter-release-v$ver.zip"
    }
  } catch {
    Write-Host "Warning: could not read version from package.json; using default name." -ForegroundColor Yellow
  }

  if (-not $NoBuild) {
    Write-Host "Building app..." -ForegroundColor Cyan
    & pwsh -File "scripts\build.ps1"
    if (-not (Test-Path "build\index.js")) {
      throw "Build output missing (build/index.js). Aborting packaging."
    }
  } else {
    Write-Host "Skipping build (NoBuild)." -ForegroundColor Yellow
  }

  $temp = Join-Path "$env:TEMP" ("tag-painter-" + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $temp | Out-Null
  $rootFolderName = "tag-painter"
  $payloadRoot = Join-Path $temp $rootFolderName
  New-Item -ItemType Directory -Path $payloadRoot | Out-Null

  $paths = @(
    "package.json",
    "package-lock.json",
    "svelte.config.js",
    "vite.config.ts",
    "tsconfig.json",
    "README.md",
    "LICENSE",
    "danbooru_tags.txt",
    "src",
    "static",
    "docs",
    "scripts",
    "build"
  )

  foreach ($p in $paths) {
    if (Test-Path $p) {
      Copy-Item $p -Destination $payloadRoot -Recurse -Force
    }
  }

  # Copy specific data files only
  $dataDir = Join-Path $payloadRoot "data"
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  $dataFiles = @("prompts.json", "settings.json", "wildcards.yaml", "outfits.txt", "lights.txt")
  foreach ($file in $dataFiles) {
    $srcPath = Join-Path "data" $file
    if (Test-Path $srcPath) {
      Copy-Item $srcPath -Destination $dataDir -Force
    }
  }

  # For packaged settings.json, blank out outputDirectory
  $settingsPath = Join-Path $dataDir "settings.json"
  if (Test-Path $settingsPath) {
    try {
      $settingsObj = Get-Content $settingsPath -Raw | ConvertFrom-Json -Depth 100
      $settingsObj.outputDirectory = ""
      $settingsObj | ConvertTo-Json -Depth 100 | Set-Content -Path $settingsPath -Encoding UTF8
      Write-Host "Release settings.json: outputDirectory blanked" -ForegroundColor DarkCyan
    } catch {
      Write-Host "Warning: failed to process settings.json for release: $_" -ForegroundColor Yellow
    }
  }

  # Place wrapper scripts at archive root
  $wrapperBat = Join-Path "release" "start.bat"
  $wrapperSh  = Join-Path "release" "start.sh"
  if (Test-Path $wrapperBat) { Copy-Item $wrapperBat -Destination (Join-Path $temp "start.bat") -Force }
  if (Test-Path $wrapperSh)  { Copy-Item $wrapperSh  -Destination (Join-Path $temp "start.sh")  -Force }

  # Include updater wrappers at archive root
  $updaterBat = Join-Path "release" "update.bat"
  $updaterSh  = Join-Path "scripts" "update.sh"
  if (Test-Path $updaterBat) { Copy-Item $updaterBat -Destination (Join-Path $temp "update.bat") -Force }
  if (Test-Path $updaterSh)  { Copy-Item $updaterSh  -Destination (Join-Path $temp "update.sh")  -Force }

  if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
  Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $OutFile
  Write-Host "Release created: $OutFile" -ForegroundColor Green
} finally {
  Pop-Location
}
