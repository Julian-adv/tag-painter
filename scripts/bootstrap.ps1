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
  [string]$ControlNetAuxRepo = "https://github.com/Fannovel16/comfyui_controlnet_aux",
  [string]$ControlNetAuxBranch = "main",
  [string]$EssentialsRepo = "https://github.com/cubiq/ComfyUI_essentials",
  [string]$EssentialsBranch = "main",
  [string]$PythonVersion = "3.12",
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
  - Installs cubiq/ComfyUI_essentials into ComfyUI/custom_nodes

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
      & curl.exe -A "Mozilla/5.0" -L "$url" -o "$destPath"
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

# Resolve latest MinGit 64-bit URL from GitHub API (fallback to static URL)
function Get-LatestGitMinGitUrl() {
  $api = 'https://api.github.com/repos/git-for-windows/git/releases/latest'
  try {
    $resp = Invoke-WebRequest -Uri $api -Headers @{ 'User-Agent' = 'pwsh' } -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    if ($json.assets) {
      $asset = $json.assets | Where-Object { $_.name -match '^MinGit-.*-64-bit\.zip$' } | Select-Object -First 1
      if ($asset -and $asset.browser_download_url) { return $asset.browser_download_url }
    }
  } catch {}
  return 'https://github.com/git-for-windows/git/releases/latest/download/MinGit-64-bit.zip'
}

# Ensure a portable Git is available under vendor\git when system git is missing.
function Install-Git($vendorDir) {
  Write-Header "Git"

  $gitZipUrl = Get-LatestGitMinGitUrl
  $gitZip = Join-Path $vendorDir "git.zip"
  $gitExtractDir = Join-Path $vendorDir "git-extract"
  $gitHome = Join-Path $vendorDir "git"

  if (-not (Test-Path (Join-Path $gitHome "cmd\git.exe"))) {
    Write-Host "Installing portable Git to $gitHome" -ForegroundColor DarkCyan
    Save-UrlIfMissing $gitZipUrl $gitZip
    # If the download appears invalid (very small), retry via API-selected URL
    try {
      if (-not (Test-Path $gitZip) -or (Get-Item $gitZip).Length -lt 100000) {
        $altUrl = Get-LatestGitMinGitUrl
        if ($altUrl -ne $gitZipUrl) {
          Write-Host "Retrying Git download from: $altUrl" -ForegroundColor DarkCyan
          Save-UrlIfMissing $altUrl $gitZip
        }
      }
    } catch {}
    Expand-Zip-To $gitZip $gitExtractDir

    if (Test-Path $gitHome) { Remove-Item -Recurse -Force $gitHome }
    $sub = Get-ChildItem -Path $gitExtractDir | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if (-not $sub) { throw "Could not locate extracted Git folder under $gitExtractDir" }
    Move-Item -Path $sub.FullName -Destination $gitHome
    Remove-Item -Recurse -Force $gitExtractDir -ErrorAction SilentlyContinue
    Remove-Item $gitZip -ErrorAction SilentlyContinue
  } else {
    Write-Host "Using vendor Git at $gitHome" -ForegroundColor Green
  }

  # Prepend vendor Git to PATH for this session (always prefer vendor Git)
  $env:PATH = (Join-Path $gitHome 'cmd') + ';' + (Join-Path $gitHome 'bin') + ';' + (Join-Path $gitHome 'usr\\bin') + ';' + $env:PATH
  Write-Host "Vendor Git ready: $((Join-Path $gitHome 'cmd\git.exe'))" -ForegroundColor Green
  return $gitHome
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

  Write-Header "Additional Python packages"
  if ($pipOk) {
    & $py -m pip install matplotlib pandas
  } else {
    & $uv pip install -p $py matplotlib pandas
  }

  return @{ PythonPath = $py; UvPath = $uv }
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

function Install-Essentials($comfyDir, $repoUrl, $branch, $venvPy, $uv) {
  $dest = Join-Path $comfyDir "custom_nodes\\ComfyUI_essentials"
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping ComfyUI_essentials install." -ForegroundColor Yellow
    return
  }
  if (Test-Path $dest) {
    Write-Host "ComfyUI_essentials already present: $dest" -ForegroundColor Green
    Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
    return
  }

  Write-Header "Install ComfyUI_essentials"

  try { git --version *> $null; $useGit = $true } catch { $useGit = $false }
  New-DirectoryIfMissing (Join-Path $comfyDir "custom_nodes")
  if ($useGit) {
    Write-Host "Cloning via git..." -ForegroundColor DarkCyan
    git clone --depth 1 --branch $branch $repoUrl $dest
  } else {
    $zipUrl = "$repoUrl/archive/refs/heads/$branch.zip"
    $tmp = Join-Path $comfyDir "custom_nodes\\.tmp_comfyui_essentials"
    New-DirectoryIfMissing $tmp
    $zipPath = Join-Path $tmp "comfyui_essentials.zip"
    Save-UrlIfMissing $zipUrl $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp | Where-Object { $_.PSIsContainer -and $_.Name -like "ComfyUI_essentials*" } | Select-Object -First 1
    if (-not $extracted) { throw "Failed to extract ComfyUI_essentials archive" }
    Move-Item -Path $extracted.FullName -Destination $dest
    Remove-Item -Recurse -Force $tmp
  }

  Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
}

function Install-ControlNetAux($comfyDir, $repoUrl, $branch, $venvPy, $uv) {
  $dest = Join-Path $comfyDir "custom_nodes\comfyui_controlnet_aux"
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping ControlNet Aux install." -ForegroundColor Yellow
    return
  }
  if (Test-Path $dest) {
    Write-Host "ControlNet Aux already present: $dest" -ForegroundColor Green
    Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
    return
  }

  Write-Header "Install comfyui_controlnet_aux"

  try { git --version *> $null; $useGit = $true } catch { $useGit = $false }
  New-DirectoryIfMissing (Join-Path $comfyDir "custom_nodes")
  if ($useGit) {
    Write-Host "Cloning via git..." -ForegroundColor DarkCyan
    git clone --depth 1 --branch $branch $repoUrl $dest
  } else {
    $zipUrl = "$repoUrl/archive/refs/heads/$branch.zip"
    $tmp = Join-Path $comfyDir "custom_nodes\.tmp_controlnet_aux"
    New-DirectoryIfMissing $tmp
    $zipPath = Join-Path $tmp "controlnet_aux.zip"
    Save-UrlIfMissing $zipUrl $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp | Where-Object { $_.PSIsContainer -and $_.Name -like "comfyui_controlnet_aux*" } | Select-Object -First 1
    if (-not $extracted) { throw "Failed to extract comfyui_controlnet_aux archive" }
    Move-Item -Path $extracted.FullName -Destination $dest
    Remove-Item -Recurse -Force $tmp
  }

  # Install node requirements
  Install-CustomNodeDependencies -nodePath $dest -venvPy $venvPy -uv $uv
}

function Install-UpscaleModel($comfyDir) {
  if (-not (Test-Path $comfyDir)) {
    Write-Host "ComfyUI not found at $comfyDir; skipping upscale model install." -ForegroundColor Yellow
    return
  }

  $upscaleDir = Join-Path $comfyDir "models\upscale_models"
  New-DirectoryIfMissing $upscaleDir

  $modelName = "2x_NMKD-UpgifLiteV2_210k.pth"
  $modelPath = Join-Path $upscaleDir $modelName

  if (Test-Path $modelPath) {
    Write-Host "Upscale model already present: $modelPath" -ForegroundColor Green
    return
  }

  Write-Header "Download upscale model: $modelName"

  # Use resolve URL for direct download from Hugging Face
  $modelUrl = "https://huggingface.co/utnah/esrgan/resolve/dc83465df24b219350e452750e881656f91d1d8b/2x_NMKD-UpgifLiteV2_210k.pth"
  Save-UrlIfMissing $modelUrl $modelPath

  Write-Host "Upscale model downloaded to: $modelPath" -ForegroundColor Green
}

# Ensure assets listed in config/downloads.json are present
function Ensure-Downloads($comfyDir) {
  $jsonPath = Join-Path (Resolve-Path ".") "config/downloads.json"
  if (-not (Test-Path $jsonPath)) { return }
  try {
    $raw = Get-Content -Path $jsonPath -Raw
    $parsed = $raw | ConvertFrom-Json
    $items = @()
    if ($parsed.items) { $items = $parsed.items } elseif ($parsed -is [array]) { $items = $parsed }
    foreach ($it in $items) {
      if (-not $it.destRelativeToComfy -or -not $it.urls) { continue }
      $dest = Join-Path $comfyDir $it.destRelativeToComfy
      if (Test-Path $dest) { continue }
      New-DirectoryIfMissing (Split-Path $dest -Parent)
      $ok = $false
      foreach ($u in $it.urls) {
        try { Save-UrlIfMissing $u $dest; if (Test-Path $dest) { $ok = $true; break } } catch {}
      }
      if ($ok) {
        Write-Host "Downloaded: $dest" -ForegroundColor Green
      } else {
        Write-Host "Failed to download: $($it.filename)" -ForegroundColor Yellow
      }
    }
  } catch {
    Write-Host "Failed to read downloads.json" -ForegroundColor Yellow
  }
}

# Main
Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  New-DirectoryIfMissing "vendor"

  $nodeHome = Install-Node -vendorDir (Resolve-Path "vendor")
  # Ensure Git availability (installs portable MinGit under vendor if system Git not found)
  Install-Git -vendorDir (Resolve-Path "vendor") | Out-Null
  $uv = $null
  $venvPy = $null

  if (-not $SkipComfy) {
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
    Install-Essentials -comfyDir $ComfyDir -repoUrl $EssentialsRepo -branch $EssentialsBranch -venvPy $venvPy -uv $uv
    Install-ControlNetAux -comfyDir $ComfyDir -repoUrl $ControlNetAuxRepo -branch $ControlNetAuxBranch -venvPy $venvPy -uv $uv
    Ensure-Downloads -comfyDir $ComfyDir
    # Common extras used by some custom nodes (e.g., matplotlib for cgem156-ComfyUI)
    if (Test-Path $venvPy) {
      # onnxruntime-gpu for DWpose if NVIDIA is present; fallback to CPU onnxruntime
      $hasNvidia = $false
      try { Get-Command nvidia-smi -ErrorAction SilentlyContinue | Out-Null; $hasNvidia = $true } catch {}
      if ($hasNvidia) {
        Install-PythonPackages -py $venvPy -uv $uv -packages @('matplotlib','pandas','onnxruntime-gpu')
      } else {
        Install-PythonPackages -py $venvPy -uv $uv -packages @('matplotlib','pandas','onnxruntime')
      }
    }
  } else {
    Write-Host "Skipping ComfyUI environment setup (SkipComfy)." -ForegroundColor Yellow
  }

  if (-not $SkipBuild) {
    Invoke-AppBuild -nodeHome $nodeHome
  } else {
    Write-Header "Skip build"
    Write-Host "Skipping app build as requested (-SkipBuild)." -ForegroundColor Yellow
  }

  Write-Header "Done"
  Write-Host "Next: run scripts\\start.ps1 to launch ComfyUI + app server." -ForegroundColor Green
  if (-not $SkipComfy) {
    Write-Host "Installed ComfyUI from latest source ZIP (or Portable if URL provided)." -ForegroundColor Yellow
  } else {
    Write-Host "ComfyUI installation was skipped (SkipComfy)." -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}
 
