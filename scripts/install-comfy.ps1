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

function Expand-Zip-To($archivePath, $destDir) {
  Write-Host "Extracting: $archivePath -> $destDir" -ForegroundColor DarkCyan
  if (Test-Path $destDir) { Remove-Item -Recurse -Force $destDir }
  Expand-Archive -Path $archivePath -DestinationPath $destDir -Force
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
  $gitHome = Join-Path $vendorDir "git"

  if (-not (Test-Path (Join-Path $gitHome "cmd\git.exe"))) {
    Write-Host "Installing portable Git to $gitHome" -ForegroundColor DarkCyan
    Save-UrlIfMissing $gitZipUrl $gitZip

    # MinGit extracts directly without a subfolder, so extract directly to gitHome
    if (Test-Path $gitHome) { Remove-Item -Recurse -Force $gitHome }
    Expand-Archive -Path $gitZip -DestinationPath $gitHome -Force
    Remove-Item $gitZip -ErrorAction SilentlyContinue

    if (-not (Test-Path (Join-Path $gitHome "cmd\git.exe"))) {
      throw "Git installation failed - git.exe not found in $gitHome"
    }
  } else {
    Write-Host "Using vendor Git at $gitHome" -ForegroundColor Green
  }

  $env:PATH = (Join-Path $gitHome 'cmd') + ';' + (Join-Path $gitHome 'bin') + ';' + (Join-Path $gitHome 'usr\bin') + ';' + $env:PATH
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
  Write-Header "ComfyUI"

  # Use vendor git explicitly
  $git = Join-Path $vendorDir "git\cmd\git.exe"
  if (-not (Test-Path $git)) {
    throw "Git not found at $git. Run Install-Git first."
  }

  if (Test-Path $comfyDir) {
    Write-Host "ComfyUI already present at $comfyDir, updating..." -ForegroundColor Green
    Push-Location $comfyDir
    try {
      & $git pull
      if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: git pull failed, continuing with existing version." -ForegroundColor Yellow
      }
    } catch {
      Write-Host "Warning: git pull failed, continuing with existing version." -ForegroundColor Yellow
    } finally {
      Pop-Location
    }
    return
  }

  Write-Host "Cloning ComfyUI repository (master branch)..." -ForegroundColor DarkCyan
  & $git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git $comfyDir

  # Check if clone was successful by verifying main.py exists
  if (-not (Test-Path (Join-Path $comfyDir "main.py"))) {
    throw "ComfyUI clone failed - main.py not found in $comfyDir"
  }

  Write-Host "ComfyUI cloned to: $comfyDir" -ForegroundColor Green
}

function Initialize-PythonVenv($vendorDir, $comfyDir, $pythonVersion, [bool]$ForceCpuMode) {
  $uv = Install-Uv $vendorDir
  $venvDir = Join-Path $vendorDir "comfy-venv"
  Write-Header "Python venv"

  # Always recreate venv to avoid corruption issues
  if (Test-Path $venvDir) {
    Write-Host "Removing existing venv..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $venvDir -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  Write-Host "Installing Python $pythonVersion..." -ForegroundColor DarkCyan
  try {
    & $uv python install $pythonVersion 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "uv python install failed, will try using system Python" -ForegroundColor Yellow
    }
  } catch {
    Write-Host "uv python install crashed, will use system Python" -ForegroundColor Yellow
  }

  Write-Host "Creating virtual environment..." -ForegroundColor DarkCyan
  & $uv venv -p $pythonVersion $venvDir
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create virtual environment"
  }

  $py = Join-Path $venvDir "Scripts\python.exe"
  if (-not (Test-Path $py)) { throw "Failed to create Python venv at $venvDir" }

  # Verify venv is working
  Write-Host "Verifying Python environment..." -ForegroundColor DarkCyan
  $pyVersion = & $py --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Python venv verification failed"
  }
  Write-Host "Python venv created successfully: $pyVersion" -ForegroundColor Green

  # Install pip in the venv for ComfyUI-Manager compatibility
  Write-Host "Installing pip in venv..." -ForegroundColor DarkCyan
  & $uv pip install -p $py pip setuptools wheel | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to install pip" -ForegroundColor Yellow
  }

  Write-Header "ComfyUI requirements"
  # Use pip for package installation (uv has issues with PyTorch wheels in requirements.txt)
  Write-Host "Installing ComfyUI requirements via pip..." -ForegroundColor DarkCyan
  $reqFile = Join-Path $comfyDir "requirements.txt"
  Write-Host "Requirements file: $reqFile" -ForegroundColor DarkCyan
  & $py -m pip install -r $reqFile 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "pip install failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    throw "Failed to install ComfyUI requirements"
  }

  Write-Header "PyTorch"
  Write-Host "Uninstalling existing PyTorch packages..." -ForegroundColor DarkCyan
  & $py -m pip uninstall -y torch torchvision torchaudio 2>$null

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
      # Use pip for PyTorch installation (uv has issues with PyTorch wheels)
      & $py -m pip install --no-cache-dir torch torchvision torchaudio --index-url $ix
      if ($LASTEXITCODE -eq 0) { $gpuInstalled = $true; break }
    }
    if (-not $gpuInstalled) {
      Write-Host "CUDA Torch wheel not available. Installing CPU Torch instead." -ForegroundColor Yellow
      & $py -m pip install --no-cache-dir torch torchvision torchaudio
    }
  } else {
    & $py -m pip install torch torchvision torchaudio
  }

  if ($ForceCpuMode) {
    Write-Host "CPU mode requested. CUDA packages were not installed." -ForegroundColor Yellow
  }

  Write-Host "Python environment setup complete." -ForegroundColor Green
  $result = @{ PythonPath = $py; UvPath = $uv }
  return $result
}

function Install-PythonPackages($py, $uv, [string[]]$packages) {
  foreach ($pkg in $packages) {
    Write-Host "Installing Python package: $pkg" -ForegroundColor DarkCyan
    & $uv pip install -p $py $pkg | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Warning: Failed to install $pkg" -ForegroundColor Yellow
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

  # If envInfo is an array (due to function output), take the last element (the hashtable)
  if ($envInfo -is [Array]) {
    $envInfo = $envInfo[-1]
  }

  if (-not $envInfo -or -not $envInfo.PythonPath) {
    throw "Failed to initialize Python environment"
  }

  $extraPkgs = @('matplotlib', 'pandas')
  if ($ForceCPU) {
    $extraPkgs += 'onnxruntime'
  } else {
    $extraPkgs += 'onnxruntime-gpu'
  }
  Install-PythonPackages -py $envInfo.PythonPath -uv $envInfo.UvPath -packages $extraPkgs

  if ($modelsBackup) {
    Restore-Models -backupDir $modelsBackup -comfyDir $ComfyDir
  }

  Write-Host "ComfyUI installation completed." -ForegroundColor Green

  # Check if ComfyUI was running
  Write-Host "Checking if ComfyUI is running..." -ForegroundColor DarkCyan
  $comfyProcess = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*main.py*--disable-auto-launch*"
  }
  if ($comfyProcess) {
    Write-Host "ComfyUI is running (PID: $($comfyProcess.Id)). Terminating for restart..." -ForegroundColor Yellow
    Stop-Process -Id $comfyProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "COMFYUI_NEEDS_RESTART"
  } else {
    Write-Host "ComfyUI is not currently running." -ForegroundColor DarkCyan
  }
} finally {
  Pop-Location
}
