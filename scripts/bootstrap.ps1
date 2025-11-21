param(
  [string]$NodeVersion = "22.19.0",
  [string]$NodeZipUrl = "https://nodejs.org/dist/v22.19.0/node-v22.19.0-win-x64.zip",
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

# Always install portable Git to vendor\git for reliability (system git may have issues)
function Install-Git($vendorDir) {
  Write-Header "Git"

  $gitZipUrl = Get-LatestGitMinGitUrl
  $gitZip = Join-Path $vendorDir "git.zip"
  $gitExtractDir = Join-Path $vendorDir "git-extract"
  $gitHome = Join-Path $vendorDir "git"

  if (-not (Test-Path (Join-Path $gitHome "cmd\git.exe"))) {
    Write-Host "Installing portable Git to $gitHome (avoiding system git issues)" -ForegroundColor DarkCyan
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
  Write-Header "ComfyUI (latest release via git)"

  # Fetch latest release tag from GitHub API
  $latestTag = $null
  try {
    Write-Host "Fetching latest release tag..." -ForegroundColor DarkCyan
    $api = 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest'
    $resp = Invoke-WebRequest -Uri $api -Headers @{ 'User-Agent' = 'pwsh' } -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    if ($json.tag_name) {
      $latestTag = $json.tag_name
      Write-Host "Latest release tag: $latestTag" -ForegroundColor Green
    }
  } catch {
    Write-Host "Failed to fetch latest release tag, falling back to master branch" -ForegroundColor Yellow
  }

  Write-Host "Cloning ComfyUI repository..." -ForegroundColor DarkCyan
  if ($latestTag) {
    git clone --depth 1 --branch $latestTag https://github.com/comfyanonymous/ComfyUI.git $comfyDir
  } else {
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git $comfyDir
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to clone ComfyUI repository"
  }
  Write-Host "ComfyUI cloned to: $comfyDir" -ForegroundColor Green
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

# Main
Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  New-DirectoryIfMissing "vendor"

  $nodeHome = Install-Node -vendorDir (Resolve-Path "vendor")
} finally {
  Pop-Location
}
 
