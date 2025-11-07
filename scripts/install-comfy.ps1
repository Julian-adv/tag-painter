param(
  [string]$ComfyDir = "vendor\ComfyUI",
  [string]$PythonVersion = "3.12",
  [switch]$Reinstall,
  [switch]$ForceCPU
)

<#
  Installs or reinstalls the local ComfyUI environment used by Tag Painter.
  - Clones the latest ComfyUI release (git) into $ComfyDir
  - Sets up a Python $PythonVersion virtual environment using uv
  - Installs ComfyUI requirements, PyTorch (CUDA when available), and common extras
  - Preserves the existing models directory when reinstalling

  Usage examples:
    pwsh -File scripts/install-comfy.ps1
    pwsh -File scripts/install-comfy.ps1 -Reinstall
    pwsh -File scripts/install-comfy.ps1 -ForceCPU
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
      throw "7-Zip is required to extract .7z archives. Install 7-Zip or provide a .zip archive."
    }
    & $sevenZip x -y -o"$destDir" "$archivePath" | Out-Null
    return
  }
  throw "Unsupported archive extension: $ext"
}

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

function Install-Git($vendorDir) {
  Write-Header "Git"

  $gitZipUrl = Get-LatestGitMinGitUrl
  $gitZip = Join-Path $vendorDir "git.zip"
  $gitExtractDir = Join-Path $vendorDir "git-extract"
  $gitHome = Join-Path $vendorDir "git"

  if (-not (Test-Path (Join-Path $gitHome "cmd\git.exe"))) {
    Write-Host "Installing portable Git to $gitHome" -ForegroundColor DarkCyan
    Save-UrlIfMissing $gitZipUrl $gitZip
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

  $env:PATH = (Join-Path $gitHome 'cmd') + ';' + (Join-Path $gitHome 'bin') + ';' + (Join-Path $gitHome 'usr\\bin') + ';' + $env:PATH
  Write-Host "Vendor Git ready." -ForegroundColor Green
  return $gitHome
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

function Install-ComfyUISource($vendorDir, $comfyDir) {
  if (Test-Path $comfyDir) {
    Write-Host "ComfyUI already present at $comfyDir" -ForegroundColor Green
    return
  }
  Write-Header "ComfyUI"

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

function Initialize-PythonVenv($vendorDir, $comfyDir, $pythonVersion, [bool]$ForceCpuMode) {
  $uv = Install-Uv $vendorDir
  $venvDir = Join-Path $vendorDir "comfy-venv"
  Write-Header "Python venv"
  & $uv python install $pythonVersion
  if (Test-Path $venvDir) {
    try {
      $pyExisting = Join-Path $venvDir "Scripts\python.exe"
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
  $py = Join-Path $venvDir "Scripts\python.exe"
  if (-not (Test-Path $py)) { throw "Failed to create Python venv at $venvDir" }

  Write-Header "ComfyUI requirements"
  try { & $py -m ensurepip --upgrade } catch {}
  $pipOk = $false
  try { & $py -m pip --version; if ($LASTEXITCODE -eq 0) { $pipOk = $true } } catch {}
  if ($pipOk) {
    & $py -m pip install --upgrade pip
    & $py -m pip install -r (Join-Path $comfyDir "requirements.txt")
  } else {
    & $uv pip install -p $py -r (Join-Path $comfyDir "requirements.txt")
  }

  Write-Header "PyTorch"
  $hasNvidia = $false
  try { Get-Command nvidia-smi -ErrorAction SilentlyContinue | Out-Null; $hasNvidia = $true } catch {}
  if ($hasNvidia -and -not $ForceCpuMode) {
    $gpuInstalled = $false
    $indexes = @(
      'https://download.pytorch.org/whl/cu128',
      'https://download.pytorch.org/whl/cu126',
      'https://download.pytorch.org/whl/cu124',
      'https://download.pytorch.org/whl/cu121'
    )
    foreach ($ix in $indexes) {
      Write-Host "Trying CUDA wheel index: $ix" -ForegroundColor DarkCyan
      if ($pipOk) {
        & $py -m pip install torch torchvision --index-url $ix
        if ($LASTEXITCODE -eq 0) { $gpuInstalled = $true; break }
      } else {
        & $uv pip install -p $py --no-cache torch torchvision --index-url $ix
        if ($LASTEXITCODE -eq 0) { $gpuInstalled = $true; break }
      }
    }
    if (-not $gpuInstalled) {
      Write-Host "CUDA Torch wheel not available. Installing CPU Torch instead." -ForegroundColor Yellow
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

  if ($ForceCpuMode) {
    Write-Host "CPU mode requested. CUDA packages were not installed." -ForegroundColor Yellow
  }

  return @{ PythonPath = $py; UvPath = $uv; PipAvailable = $pipOk }
}

function Install-PythonPackages($py, $uv, [bool]$pipOk, [string[]]$packages) {
  try { & $py -m ensurepip --upgrade } catch {}
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

function Backup-Models($comfyDir) {
  if (-not (Test-Path (Join-Path $comfyDir 'models'))) { return $null }
  $backup = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
  New-DirectoryIfMissing $backup
  $modelsBackup = Join-Path $backup 'models'
  Move-Item -Path (Join-Path $comfyDir 'models') -Destination $modelsBackup
  return $backup
}

function Restore-Models($backupDir, $comfyDir) {
  if (-not $backupDir) { return }
  $modelsBackup = Join-Path $backupDir 'models'
  if (-not (Test-Path $modelsBackup)) { return }
  $target = Join-Path $comfyDir 'models'
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Move-Item -Path $modelsBackup -Destination $target
  Remove-Item -Recurse -Force $backupDir -ErrorAction SilentlyContinue
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  New-DirectoryIfMissing 'vendor'
  $vendorDir = Resolve-Path 'vendor'

  Install-Git -vendorDir $vendorDir | Out-Null

  $modelsBackup = $null
  if ($Reinstall -and (Test-Path $ComfyDir)) {
    Write-Header "Reinstall"
    $modelsBackup = Backup-Models $ComfyDir
    Remove-Item -Recurse -Force $ComfyDir -ErrorAction SilentlyContinue
  }

  Install-ComfyUISource -vendorDir $vendorDir -comfyDir $ComfyDir

  $envInfo = Initialize-PythonVenv -vendorDir $vendorDir -comfyDir $ComfyDir -pythonVersion $PythonVersion -ForceCpuMode:$ForceCPU
  $extraPkgs = @('matplotlib', 'pandas')
  if ($ForceCPU) {
    $extraPkgs += 'onnxruntime'
  } else {
    $extraPkgs += 'onnxruntime-gpu'
  }
  Install-PythonPackages -py $envInfo.PythonPath -uv $envInfo.UvPath -pipOk $envInfo.PipAvailable -packages $extraPkgs

  if ($modelsBackup) {
    Restore-Models -backupDir $modelsBackup -comfyDir $ComfyDir
  }

  Write-Host "ComfyUI installation completed." -ForegroundColor Green
} finally {
  Pop-Location
}
