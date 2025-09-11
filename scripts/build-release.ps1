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
  $dataFiles = @("prompts.json", "settings.json", "wildcards.yaml")
  foreach ($file in $dataFiles) {
    $srcPath = Join-Path "data" $file
    if (Test-Path $srcPath) {
      Copy-Item $srcPath -Destination $dataDir -Force
    }
  }

  # Place wrapper start scripts at archive root
  $wrapperPs1 = Join-Path "release" "start.ps1"
  $wrapperSh  = Join-Path "release" "start.sh"
  if (Test-Path $wrapperPs1) { Copy-Item $wrapperPs1 -Destination (Join-Path $temp "start.ps1") -Force }
  if (Test-Path $wrapperSh)  { Copy-Item $wrapperSh  -Destination (Join-Path $temp "start.sh")  -Force }

  if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
  Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $OutFile
  Write-Host "Release created: $OutFile" -ForegroundColor Green
} finally {
  Pop-Location
}
