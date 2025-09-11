param(
  [string]$NodeVersion = "22.19.0",
  [string]$NodeZipUrl = "https://nodejs.org/dist/v22.19.0/node-v22.19.0-win-x64.zip",
  [string]$ComfyPortableUrl = "",
  [string]$ComfyDir = "vendor\\ComfyUI",
  [string]$CustomNodeRepo = "https://github.com/laksjdjf/cgem156-ComfyUI",
  [string]$CustomNodeBranch = "main",
  [string]$CustomScriptsRepo = "https://github.com/pythongosssss/ComfyUI-Custom-Scripts",
  [string]$CustomScriptsBranch = "main",
  [string]$ImpactPackRepo = "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
  [string]$ImpactPackBranch = "Main",
  [string]$ImpactSubpackRepo = "https://github.com/ltdrdata/ComfyUI-Impact-Subpack",
  [string]$ImpactSubpackBranch = "main",
  [string]$PythonVersion = "3.13",
  [switch]$SkipNode,
  [switch]$SkipComfy,
  [switch]$SkipBuild
)

<#
  Windows bootstrap script
  - Installs Node v$NodeVersion locally (portable) if not available
  - Installs JS deps and builds the app with adapter-node
  - Installs ComfyUI from latest release source ZIP by default (no 7-Zip or Git needed)
  - (Optional) If -ComfyPortableUrl is provided, installs ComfyUI Portable instead
  - Creates Python venv via uv and installs ComfyUI requirements + Torch
  - Installs custom node cgem156-ComfyUI into ComfyUI/custom_nodes
  - Installs ComfyUI-Impact-Pack into ComfyUI/custom_nodes
  - Installs ComfyUI-Impact-Subpack into ComfyUI/custom_nodes

  Usage examples:
    pwsh -File scripts/bootstrap.ps1 -ComfyPortableUrl "<portable_zip_url>"
    pwsh -File scripts/bootstrap.ps1 -SkipComfy

  Notes:
  - If you prefer your system Node, pass -SkipNode
  - For ComfyUI Portable, pass a direct downloadable URL to its zip/7z
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
      & curl.exe -L "$url" -o "$destPath"
      if ((Test-Path $destPath) -and (Get-Item $destPath).Length -gt 0) { return }
    }
  } catch {}
  throw "Failed to download $url"
}

function Get-7ZipPath() {
  try {
    $cmd = Get-Command 7z -ErrorAction Stop
    return $cmd.Path
  } catch {
    $c1 = "C:\\Program Files\\7-Zip\\7z.exe"
    $c2 = "C:\\Program Files (x86)\\7-Zip\\7z.exe"
    if (Test-Path $c1) { return $c1 }
    if (Test-Path $c2) { return $c2 }
  }
  return $null
}

function Expand-Zip-To($archivePath, $destDir) {
  Write-Host "Extracting: $archivePath -> $destDir" -ForegroundColor DarkCyan
  if (Test-Path $destDir) { Remove-Item -Recurse -Force $destDir }

  $ext = [System.IO.Path]::GetExtension($archivePath).ToLowerInvariant()
  if ($ext -eq '.zip') {
    Expand-Archive -Path $archivePath -DestinationPath $destDir -Force
    return
  }
  if ($ext -eq '.7z') {
    $sevenZip = Get-7ZipPath
    if (-not $sevenZip) {
      throw "7-Zip is required to extract .7z archives. Install 7-Zip or provide a .zip URL."
    }
    & $sevenZip x -y -o"$destDir" "$archivePath" | Out-Null
    return
  }
  throw "Unsupported archive extension: $ext"
}

function Get-LatestComfyZipUrl() {
  $api = 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest'
  Write-Host "Fetching latest release metadata..." -ForegroundColor DarkCyan
  $resp = Invoke-WebRequest -Uri $api -Headers @{ 'User-Agent' = 'pwsh' } -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if ($json.zipball_url) { return $json.zipball_url }
  # Fallback to main branch archive
  return 'https://github.com/comfyanonymous/ComfyUI/archive/refs/heads/master.zip'
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

function Invoke-Npm {
  param(
    [string]$nodeHome,
    [string[]]$npmArgs
  )
  if ($nodeHome) {
    & (Join-Path $nodeHome "npm.cmd") @npmArgs
  } else {
    & npm @npmArgs
  }
}

function Invoke-AppBuild($nodeHome) {
  Write-Header "Install deps + Build"
  Invoke-Npm -nodeHome $nodeHome -npmArgs @("ci")
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm ci failed. Falling back to 'npm install' to update lockfile." -ForegroundColor Yellow
    Invoke-Npm -nodeHome $nodeHome -npmArgs @("install")
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }
  Invoke-Npm -nodeHome $nodeHome -npmArgs @("run", "build")
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}

function Install-ComfyUIPortable($vendorDir, $comfyDir, $portableUrl) {
  if ($SkipComfy) {
    Write-Host "Skipping ComfyUI setup (SkipComfy)." -ForegroundColor Yellow
    return
  }

  Write-Header "ComfyUI Portable"

  if (Test-Path $comfyDir) {
    Write-Host "ComfyUI already present at $comfyDir" -ForegroundColor Green
    return
  }

  if (-not $portableUrl) {
    Write-Host "No -ComfyPortableUrl provided. Please pass a direct URL to the Windows portable archive." -ForegroundColor Yellow
    Write-Host "You can rerun: pwsh -File scripts\\bootstrap.ps1 -ComfyPortableUrl <URL>" -ForegroundColor Yellow
    return
  }

  $tmp = Join-Path $vendorDir "comfy-download"
  New-DirectoryIfMissing $tmp
  try {
    $uri = [System.Uri]$portableUrl
    $leaf = [System.IO.Path]::GetFileName($uri.AbsolutePath)
    if (-not $leaf) { $leaf = "comfy.zip" }
  } catch { $leaf = "comfy.zip" }
  $archive = Join-Path $tmp $leaf
  Save-UrlIfMissing $portableUrl $archive

  $extractDir = Join-Path $tmp "extract"
  Expand-Zip-To $archive $extractDir

  # Try to locate top-level extracted folder and rename to ComfyUI
  $first = Get-ChildItem -Path $extractDir | Select-Object -First 1
  if (-not $first) { throw "Failed to extract ComfyUI archive" }
  Move-Item -Path $first.FullName -Destination $comfyDir
  Remove-Item -Recurse -Force $tmp

  Write-Host "ComfyUI extracted to: $comfyDir" -ForegroundColor Green
}

function Install-ComfyUISource($vendorDir, $comfyDir) {
  if ($SkipComfy) {
    Write-Host "Skipping ComfyUI setup (SkipComfy)." -ForegroundColor Yellow
    return
  }
  if (Test-Path $comfyDir) {
    Write-Host "ComfyUI already present at $comfyDir" -ForegroundColor Green
    return
  }
  Write-Header "ComfyUI (latest source ZIP)"
  $tmp = Join-Path $vendorDir "comfy-src"
  New-DirectoryIfMissing $tmp
  $zipUrl = Get-LatestComfyZipUrl
  $zipPath = Join-Path $tmp "comfyui-source.zip"
  Save-UrlIfMissing $zipUrl $zipPath
  $extractDir = Join-Path $tmp "extract"
  Expand-Zip-To $zipPath $extractDir
  $first = Get-ChildItem -Path $extractDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1
  if (-not $first) { throw "Failed to extract ComfyUI source archive" }
  Move-Item -Path $first.FullName -Destination $comfyDir
  Remove-Item -Recurse -Force $tmp
  Write-Host "ComfyUI extracted to: $comfyDir" -ForegroundColor Green
}

function Install-Uv($vendorDir) {
  $uvPath = Join-Path $vendorDir "uv.exe"
  if (Test-Path $uvPath) { return $uvPath }
  Write-Header "uv (Python manager)"
  $uvZip = Join-Path $vendorDir "uv.zip"
  $uvZipUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip'
  $uvExeUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.exe'
  try {
    Save-UrlIfMissing $uvZipUrl $uvZip
    $tmpDir = Join-Path $vendorDir "uv-extract"
    Expand-Zip-To $uvZip $tmpDir
    $found = Get-ChildItem -Path $tmpDir -Recurse -Filter "uv.exe" | Select-Object -First 1
    if ($found) {
      Copy-Item $found.FullName $uvPath -Force
      Remove-Item -Recurse -Force $tmpDir, $uvZip -ErrorAction SilentlyContinue
      return $uvPath
    }
  } catch {}
  try {
    Save-UrlIfMissing $uvExeUrl $uvPath
    if (Test-Path $uvPath) { return $uvPath }
  } catch {}
  $installPs1 = Join-Path $vendorDir "uv-install.ps1"
  try {
    Save-UrlIfMissing 'https://astral.sh/uv/install.ps1' $installPs1
    & powershell -NoProfile -ExecutionPolicy Bypass -File $installPs1 -y | Out-Null
    $candidates = @(
      "$env:USERPROFILE\.local\bin\uv.exe",
      "$env:LOCALAPPDATA\Programs\uv\uv.exe"
    )
    foreach ($c in $candidates) {
      if (Test-Path $c) { Copy-Item $c $uvPath -Force; break }
    }
  } catch {}
  if (-not (Test-Path $uvPath)) { throw "Failed to install uv" }
  return $uvPath
}

function Initialize-PythonVenv($vendorDir, $comfyDir, $pythonVersion) {
  $uv = Install-Uv $vendorDir
  $venvDir = Join-Path $vendorDir "comfy-venv"
  Write-Header "Python venv"
  & $uv python install $pythonVersion
  # Recreate venv if existing version mismatches requested
  if (Test-Path $venvDir) {
    try {
      $pyExisting = Join-Path $venvDir "Scripts\\python.exe"
      $verOut = & $pyExisting -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"
      if ($verOut.Trim() -ne $pythonVersion) {
        Write-Host "Recreating venv with Python $pythonVersion (was $verOut)." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $venvDir
      }
    } catch {}
  }
  if (-not (Test-Path $venvDir)) {
    & $uv venv -p $pythonVersion $venvDir
  }
  $py = Join-Path $venvDir "Scripts\\python.exe"
  if (-not (Test-Path $py)) { throw "Failed to create Python venv at $venvDir" }

  Write-Header "ComfyUI requirements"
  # Ensure pip exists in the venv (uv venv may not include pip by default)
  try { & $py -m ensurepip --upgrade } catch {}
  $pipOk = $false
  try { & $py -m pip --version; if ($LASTEXITCODE -eq 0) { $pipOk = $true } } catch {}
  if ($pipOk) {
    & $py -m pip install --upgrade pip
    & $py -m pip install -r (Join-Path $comfyDir "requirements.txt")
  } else {
    # Fallback: use uv pip targeting the venv's interpreter
    & $uv pip install -p $py -r (Join-Path $comfyDir "requirements.txt")
  }

  Write-Header "PyTorch"
  $hasNvidia = $false
  try { Get-Command nvidia-smi -ErrorAction SilentlyContinue | Out-Null; $hasNvidia = $true } catch {}
  if ($hasNvidia) {
    $gpuInstalled = $false
    $indexes = @(
      'https://download.pytorch.org/whl/cu126',
      'https://download.pytorch.org/whl/cu124',
      'https://download.pytorch.org/whl/cu121'
    )
    foreach ($ix in $indexes) {
      Write-Host "Trying CUDA wheel index: $ix" -ForegroundColor DarkCyan
      if ($pipOk) {
        & $py -m pip install --upgrade --force-reinstall --no-cache-dir torch torchvision torchaudio --index-url $ix
        if ($LASTEXITCODE -eq 0) { $gpuInstalled = $true; break }
      } else {
        & $uv pip install -p $py --reinstall --no-cache torch torchvision torchaudio --index-url $ix
        if ($LASTEXITCODE -eq 0) { $gpuInstalled = $true; break }
      }
    }
    if (-not $gpuInstalled) {
      Write-Host "CUDA Torch wheel not available for this environment. Installing CPU Torch instead." -ForegroundColor Yellow
      if ($pipOk) {
        & $py -m pip install --upgrade --force-reinstall --no-cache-dir torch torchvision torchaudio
      } else {
        & $uv pip install -p $py --reinstall --no-cache torch torchvision torchaudio
      }
    }
  } else {
    if ($pipOk) {
      & $py -m pip install torch torchvision torchaudio
    } else {
      & $uv pip install -p $py torch torchvision torchaudio
    }
  }
}

function Install-PythonPackages($py, $uv, [string[]]$packages) {
  try { & $py -m ensurepip --upgrade } catch {}
  $pipOk = $false
  try { & $py -m pip --version; if ($LASTEXITCODE -eq 0) { $pipOk = $true } } catch {}
  foreach ($pkg in $packages) {
    $ok = $false
    $code = @"
import importlib, sys
m = """$pkg"""
try:
    importlib.import_module(m)
except Exception:
    sys.exit(1)
else:
    sys.exit(0)
"@
    try { & $py -c $code | Out-Null; if ($LASTEXITCODE -eq 0) { $ok = $true } } catch { $ok = $false }
    if (-not $ok) {
      Write-Host "Installing Python package: $pkg" -ForegroundColor DarkCyan
      if ($pipOk) { & $py -m pip install $pkg } else { & $uv pip install -p $py $pkg }
    }
  }
}

function Install-CustomNode($comfyDir, $repoUrl, $branch, $venvPy, $uv) {
  $dest = Join-Path $comfyDir "custom_nodes\\cgem156-ComfyUI"
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping custom node install." -ForegroundColor Yellow
    return
  }
  if (Test-Path $dest) {
    Write-Host "Custom node already present: $dest" -ForegroundColor Green
    Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
    return
  }

  Write-Header "Install custom node: cgem156-ComfyUI"

  try {
    git --version *> $null
    $useGit = $true
  } catch { $useGit = $false }

  New-DirectoryIfMissing (Join-Path $comfyDir "custom_nodes")
  if ($useGit) {
    Write-Host "Cloning via git..." -ForegroundColor DarkCyan
    git clone --depth 1 --branch $branch $repoUrl $dest
  } else {
    $zipUrl = "$repoUrl/archive/refs/heads/$branch.zip"
    $tmp = Join-Path $comfyDir "custom_nodes\\.tmp_cgem156"
    New-DirectoryIfMissing $tmp
    $zipPath = Join-Path $tmp "cgem156.zip"
    Save-UrlIfMissing $zipUrl $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp | Where-Object { $_.PSIsContainer -and $_.Name -like "cgem156-ComfyUI*" } | Select-Object -First 1
    if (-not $extracted) { throw "Failed to extract custom node archive" }
    Move-Item -Path $extracted.FullName -Destination $dest
    Remove-Item -Recurse -Force $tmp
  }
  
  # Install dependencies if requirements.txt exists
  Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
}

function Install-CustomScripts($comfyDir, $repoUrl, $branch, $venvPy, $uv) {
  $dest = Join-Path $comfyDir "custom_nodes\\ComfyUI-Custom-Scripts"
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping custom scripts install." -ForegroundColor Yellow
    return
  }
  if (Test-Path $dest) {
    Write-Host "Custom scripts already present: $dest" -ForegroundColor Green
    Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
    return
  }

  Write-Header "Install custom scripts: ComfyUI-Custom-Scripts"

  try {
    git --version *> $null
    $useGit = $true
  } catch { $useGit = $false }

  New-DirectoryIfMissing (Join-Path $comfyDir "custom_nodes")
  if ($useGit) {
    Write-Host "Cloning via git..." -ForegroundColor DarkCyan
    git clone --depth 1 --branch $branch $repoUrl $dest
  } else {
    $zipUrl = "$repoUrl/archive/refs/heads/$branch.zip"
    $tmp = Join-Path $comfyDir "custom_nodes\\.tmp_custom_scripts"
    New-DirectoryIfMissing $tmp
    $zipPath = Join-Path $tmp "custom_scripts.zip"
    Save-UrlIfMissing $zipUrl $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp | Where-Object { $_.PSIsContainer -and $_.Name -like "ComfyUI-Custom-Scripts*" } | Select-Object -First 1
    if (-not $extracted) { throw "Failed to extract custom scripts archive" }
    Move-Item -Path $extracted.FullName -Destination $dest
    Remove-Item -Recurse -Force $tmp
  }
  
  # Install dependencies if requirements.txt exists
  Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
}

function Install-CustomNodeDependencies($nodePath, $venvPy, $uv) {
  $requirementsFile = Join-Path $nodePath "requirements.txt"
  if (Test-Path $requirementsFile) {
    $nodeName = Split-Path $nodePath -Leaf
    Write-Host "Installing dependencies for $nodeName..." -ForegroundColor DarkCyan
    
    try { & $venvPy -m ensurepip --upgrade } catch {}
    $pipOk = $false
    try { & $venvPy -m pip --version | Out-Null; if ($LASTEXITCODE -eq 0) { $pipOk = $true } } catch {}
    
    if ($pipOk) {
      & $venvPy -m pip install -r $requirementsFile
    } else {
      & $uv pip install -p $venvPy -r $requirementsFile
    }
  }
}

function Install-ImpactPack($comfyDir, $repoUrl, $branch, $venvPy, $uv) {
  $dest = Join-Path $comfyDir "custom_nodes\\ComfyUI-Impact-Pack"
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping Impact Pack install." -ForegroundColor Yellow
    return
  }
  if (Test-Path $dest) {
    Write-Host "Impact Pack already present: $dest" -ForegroundColor Green
    Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
    return
  }

  Write-Header "Install ComfyUI-Impact-Pack"

  try {
    git --version *> $null
    $useGit = $true
  } catch { $useGit = $false }

  New-DirectoryIfMissing (Join-Path $comfyDir "custom_nodes")
  if ($useGit) {
    Write-Host "Cloning via git..." -ForegroundColor DarkCyan
    git clone --depth 1 --branch $branch $repoUrl $dest
  } else {
    $zipUrl = "$repoUrl/archive/refs/heads/$branch.zip"
    $tmp = Join-Path $comfyDir "custom_nodes\\.tmp_impact_pack"
    New-DirectoryIfMissing $tmp
    $zipPath = Join-Path $tmp "impact_pack.zip"
    Save-UrlIfMissing $zipUrl $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp | Where-Object { $_.PSIsContainer -and $_.Name -like "ComfyUI-Impact-Pack*" } | Select-Object -First 1
    if (-not $extracted) { throw "Failed to extract Impact Pack archive" }
    Move-Item -Path $extracted.FullName -Destination $dest
    Remove-Item -Recurse -Force $tmp
  }
  
  # Install dependencies if requirements.txt exists
  Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
}

function Install-ImpactSubpack($comfyDir, $repoUrl, $branch, $venvPy, $uv) {
  $dest = Join-Path $comfyDir "custom_nodes\\ComfyUI-Impact-Subpack"
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping Impact Subpack install." -ForegroundColor Yellow
    return
  }
  if (Test-Path $dest) {
    Write-Host "Impact Subpack already present: $dest" -ForegroundColor Green
    Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
    return
  }

  Write-Header "Install ComfyUI-Impact-Subpack"

  try {
    git --version *> $null
    $useGit = $true
  } catch { $useGit = $false }

  New-DirectoryIfMissing (Join-Path $comfyDir "custom_nodes")
  if ($useGit) {
    Write-Host "Cloning via git..." -ForegroundColor DarkCyan
    git clone --depth 1 --branch $branch $repoUrl $dest
  } else {
    $zipUrl = "$repoUrl/archive/refs/heads/$branch.zip"
    $tmp = Join-Path $comfyDir "custom_nodes\\.tmp_impact_subpack"
    New-DirectoryIfMissing $tmp
    $zipPath = Join-Path $tmp "impact_subpack.zip"
    Save-UrlIfMissing $zipUrl $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp | Where-Object { $_.PSIsContainer -and $_.Name -like "ComfyUI-Impact-Subpack*" } | Select-Object -First 1
    if (-not $extracted) { throw "Failed to extract Impact Subpack archive" }
    Move-Item -Path $extracted.FullName -Destination $dest
    Remove-Item -Recurse -Force $tmp
  }
  
  # Install dependencies if requirements.txt exists
  Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
}

# Main
Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  New-DirectoryIfMissing "vendor"

  $nodeHome = Install-Node -vendorDir (Resolve-Path "vendor")
  if ($ComfyPortableUrl) {
    Install-ComfyUIPortable -vendorDir (Resolve-Path "vendor") -comfyDir $ComfyDir -portableUrl $ComfyPortableUrl
  } else {
    Install-ComfyUISource -vendorDir (Resolve-Path "vendor") -comfyDir $ComfyDir
    Initialize-PythonVenv -vendorDir (Resolve-Path "vendor") -comfyDir $ComfyDir -pythonVersion $PythonVersion
  }
  $uv = Install-Uv (Resolve-Path "vendor")
  $venvPy = Join-Path (Resolve-Path "vendor") "comfy-venv\Scripts\python.exe"
  Install-CustomNode -comfyDir $ComfyDir -repoUrl $CustomNodeRepo -branch $CustomNodeBranch -venvPy $venvPy -uv $uv
  Install-CustomScripts -comfyDir $ComfyDir -repoUrl $CustomScriptsRepo -branch $CustomScriptsBranch -venvPy $venvPy -uv $uv
  Install-ImpactPack -comfyDir $ComfyDir -repoUrl $ImpactPackRepo -branch $ImpactPackBranch -venvPy $venvPy -uv $uv
  Install-ImpactSubpack -comfyDir $ComfyDir -repoUrl $ImpactSubpackRepo -branch $ImpactSubpackBranch -venvPy $venvPy -uv $uv
  # Common extras used by some custom nodes (e.g., matplotlib for cgem156-ComfyUI)
  if (Test-Path $venvPy) {
    Install-PythonPackages -py $venvPy -uv $uv -packages @('matplotlib')
  }

  if (-not $SkipBuild) {
    Invoke-AppBuild -nodeHome $nodeHome
  } else {
    Write-Header "Skip build"
    Write-Host "Skipping app build as requested (-SkipBuild)." -ForegroundColor Yellow
  }

  Write-Header "Done"
  Write-Host "Next: run scripts\\start.ps1 to launch ComfyUI + app server." -ForegroundColor Green
  Write-Host "Installed ComfyUI from latest source ZIP (or Portable if URL provided)." -ForegroundColor Yellow
} finally {
  Pop-Location
}
