param(
  [string]$NodeVersion = "24.11.1",
  [string]$NodeZipUrl = "https://nodejs.org/dist/v24.11.1/node-v24.11.1-win-x64.zip",
  [string]$ComfyDir = "vendor\ComfyUI",
  [string]$PythonVersion = "3.12",
  [switch]$SkipNode,
  [switch]$ForceCPU
)

<#
  Windows bootstrap script - Complete installation
  - Installs portable Git (MinGit) if system Git is not available
  - Installs Node v$NodeVersion locally (portable) if not available
  - Installs uv (Python manager)
  - Clones ComfyUI repository
  - Sets up Python virtual environment with all dependencies
  - Installs all custom nodes from config/downloads.json
  - Downloads all required files (models, VAEs, etc.)
  - Installs Nunchaku runtime via ComfyUI workflow

  Usage examples:
    pwsh -File scripts/bootstrap.ps1
    pwsh -File scripts/bootstrap.ps1 -SkipNode
    pwsh -File scripts/bootstrap.ps1 -ForceCPU
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Header($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function New-DirectoryIfMissing($path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}

function Save-UrlIfMissing($url, $destPath, $minSize = 100) {
  if (Test-Path $destPath) {
    $existingSize = (Get-Item $destPath).Length
    if ($existingSize -ge $minSize) { return }
    Write-Host "Existing file too small ($existingSize bytes), re-downloading..." -ForegroundColor Yellow
    Remove-Item $destPath -Force
  }
  Write-Host "Downloading: $url" -ForegroundColor DarkCyan
  try {
    Invoke-WebRequest -Uri $url -OutFile $destPath -Headers @{ 'User-Agent' = 'Mozilla/5.0' } -MaximumRedirection 10
    if ((Test-Path $destPath) -and (Get-Item $destPath).Length -ge $minSize) { return }
    if (Test-Path $destPath) { Remove-Item $destPath -Force }
  } catch {
    if (Test-Path $destPath) { Remove-Item $destPath -Force -ErrorAction SilentlyContinue }
  }
  try {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -A "Mozilla/5.0" -L --fail "$url" -o "$destPath"
      if ((Test-Path $destPath) -and (Get-Item $destPath).Length -ge $minSize) { return }
      if (Test-Path $destPath) { Remove-Item $destPath -Force }
    }
  } catch {
    if (Test-Path $destPath) { Remove-Item $destPath -Force -ErrorAction SilentlyContinue }
  }
  throw "Failed to download $url (file too small or download failed)"
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

# ============================================================================
# INSTALLATION FUNCTIONS
# ============================================================================

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
  if (Test-Path $uvPath) {
    Write-Host "Using existing uv at $uvPath" -ForegroundColor Green
    return $uvPath
  }
  Write-Header "uv (Python manager)"
  $uvZip = Join-Path $vendorDir "uv.zip"
  $uvZipUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip'
  $tmpDir = Join-Path $vendorDir "uv-extract"
  $retryDelaySeconds = 3
  for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
      if (Test-Path $uvZip) { Remove-Item $uvZip -Force -ErrorAction SilentlyContinue }
      if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue }
      Save-UrlIfMissing $uvZipUrl $uvZip
      Expand-Zip-To $uvZip $tmpDir
      $found = Get-ChildItem -Path $tmpDir -Recurse -Filter "uv.exe" | Select-Object -First 1
      if ($found) {
        Copy-Item $found.FullName $uvPath -Force
        Remove-Item -Recurse -Force $tmpDir, $uvZip -ErrorAction SilentlyContinue
        return $uvPath
      }
    } catch {
      if ($attempt -lt 10) {
        Write-Host "uv download attempt $attempt failed, retrying in $retryDelaySeconds seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds $retryDelaySeconds
      }
    }
  }
  if (-not (Test-Path $uvPath)) { throw "Failed to install uv" }
  return $uvPath
}

function Install-ComfyUISource($vendorDir, $comfyDir, $gitHome) {
  Write-Header "ComfyUI"

  # Use vendor git explicitly
  $git = Join-Path $gitHome "cmd\git.exe"
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

function Initialize-PythonVenv($vendorDir, $comfyDir, $pythonVersion, [bool]$ForceCpuMode, $uvPath) {
  $venvDir = Join-Path $vendorDir "comfy-venv"
  Write-Header "Python venv"

  # Suppress uv hardlink warning when cache and target are on different filesystems
  $env:UV_LINK_MODE = "copy"

  # Always recreate venv to avoid corruption issues
  if (Test-Path $venvDir) {
    Write-Host "Removing existing venv..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $venvDir -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  Write-Host "Installing Python $pythonVersion..." -ForegroundColor DarkCyan
  try {
    & $uvPath python install $pythonVersion 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "uv python install failed, will try using system Python" -ForegroundColor Yellow
    }
  } catch {
    Write-Host "uv python install crashed, will use system Python" -ForegroundColor Yellow
  }

  Write-Host "Creating virtual environment..." -ForegroundColor DarkCyan
  & $uvPath venv -p $pythonVersion $venvDir
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

  # Activate the virtual environment to set up environment variables
  $activateScript = Join-Path $venvDir "Scripts\Activate.ps1"
  if (Test-Path $activateScript) {
    Write-Host "Activating virtual environment..." -ForegroundColor DarkCyan
    . $activateScript
  }

  # Detect NVIDIA GPU availability once (used for requirements and PyTorch installs)
  $hasNvidia = $false
  try { Get-Command nvidia-smi -ErrorAction SilentlyContinue | Out-Null; $hasNvidia = $true } catch {}

  # Install pip in the venv for ComfyUI-Manager compatibility
  Write-Host "Installing pip in venv..." -ForegroundColor DarkCyan
  & $uvPath pip install -p $py pip setuptools wheel | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to install pip" -ForegroundColor Yellow
  }

  Write-Header "ComfyUI requirements"
  # Use pip directly for better dependency resolution (uv has issues with transitive dependencies)
  Write-Host "Installing ComfyUI requirements via pip (this may take a while)..." -ForegroundColor DarkCyan
  $reqFile = Join-Path $comfyDir "requirements.txt"
  Write-Host "Requirements file: $reqFile" -ForegroundColor DarkCyan

  $pip = Join-Path $venvDir "Scripts\pip.exe"
  if (-not (Test-Path $pip)) {
    Write-Host "Error: pip not found at $pip" -ForegroundColor Red
    throw "pip.exe not found in venv"
  }

  $pipArgs = @('install', '-r', $reqFile)
  if ($hasNvidia -and -not $ForceCpuMode) {
    $pipArgs += @('--extra-index-url', 'https://download.pytorch.org/whl/cu128')
  }
  Write-Host "pip path: $pip" -ForegroundColor Magenta
  Write-Host "Requirements file exists: $(Test-Path $reqFile)" -ForegroundColor Magenta
  Write-Host "Running: $pip $($pipArgs -join ' ')" -ForegroundColor DarkCyan
  & $pip @pipArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "pip install failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    throw "Failed to install ComfyUI requirements"
  }

  # Install critical dependencies first (these are often missed by pip's resolver)
  Write-Host "Installing critical dependencies..." -ForegroundColor DarkCyan
  $criticalPkgs = @(
    'typing_extensions',
    'certifi',
    'urllib3',
    'requests',
    'packaging',
    'pyyaml',
    'scipy',
    'pydantic',
    'annotated-types',
    'tqdm',
    'easydict',
    'contourpy',
    'lazy-loader',
    'opencv-python-headless',
    'tifffile',
    'scikit-image'
  )
  & $pip install @criticalPkgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some critical packages may have failed to install" -ForegroundColor Yellow
  }

  # Verify key packages are installed and fix missing dependencies
  Write-Host "Verifying installation..." -ForegroundColor DarkCyan
  $verifyPkgs = @(
    @{name='torch'; module='torch'},
    @{name='urllib3'; module='urllib3'},
    @{name='pyyaml'; module='yaml'},
    @{name='packaging'; module='packaging'},
    @{name='typing_extensions'; module='typing_extensions'},
    @{name='scipy'; module='scipy'},
    @{name='contourpy'; module='contourpy'},
    @{name='lazy-loader'; module='lazy_loader'},
    @{name='pydantic'; module='pydantic'},
    @{name='certifi'; module='certifi'},
    @{name='requests'; module='requests'}
  )
  foreach ($pkg in $verifyPkgs) {
    $result = & $py -c "import $($pkg.module)" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Warning: $($pkg.name) not properly installed, installing..." -ForegroundColor Yellow
      & $pip install $($pkg.name)
      if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to install $($pkg.name)" -ForegroundColor Red
      }
    } else {
      Write-Host "  $($pkg.name) OK" -ForegroundColor Green
    }
  }

  if ($ForceCpuMode) {
    Write-Host "CPU mode requested. CUDA packages were not installed." -ForegroundColor Yellow
  }

  # Install extra packages (urllib3 should be auto-installed but adding as fallback)
  $extraPkgs = @('matplotlib', 'pandas', 'urllib3')
  if ($ForceCpuMode) {
    $extraPkgs += 'onnxruntime'
  } else {
    $extraPkgs += 'onnxruntime-gpu'
  }
  foreach ($pkg in $extraPkgs) {
    Write-Host "Installing Python package: $pkg" -ForegroundColor DarkCyan
    & $pip install $pkg | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Warning: Failed to install $pkg" -ForegroundColor Yellow
    }
  }

  Write-Host "Python environment setup complete." -ForegroundColor Green
  return @{ PythonPath = $py; UvPath = $uvPath }
}

function Install-CustomNodes($vendorDir, $comfyDir, $gitHome, $envInfo) {
  Write-Header "Custom Nodes"

  $git = Join-Path $gitHome "cmd\git.exe"
  $configPath = Join-Path (Get-Location) "config\downloads.json"

  if (-not (Test-Path $configPath)) {
    Write-Host "Warning: config/downloads.json not found, skipping custom nodes." -ForegroundColor Yellow
    return
  }

  $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
  $customNodes = $config.items | Where-Object { $_.category -eq "custom-node" }

  if ($customNodes.Count -eq 0) {
    Write-Host "No custom nodes to install." -ForegroundColor Green
    return
  }

  $customNodesDir = Join-Path $comfyDir "custom_nodes"
  New-DirectoryIfMissing $customNodesDir

  foreach ($node in $customNodes) {
    $nodeDest = Join-Path $comfyDir $node.destRelativeToComfy
    $nodeUrl = $node.urls[0]
    $nodeName = $node.filename

    Write-Host "Processing custom node: $nodeName" -ForegroundColor DarkCyan

    if (Test-Path $nodeDest) {
      # Update existing node
      Write-Host "  Updating $nodeName..." -ForegroundColor DarkCyan
      Push-Location $nodeDest
      try {
        & $git pull 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
          Write-Host "  Warning: git pull failed for $nodeName" -ForegroundColor Yellow
        }
      } catch {
        Write-Host "  Warning: git pull failed for $nodeName" -ForegroundColor Yellow
      } finally {
        Pop-Location
      }
    } else {
      # Clone new node
      Write-Host "  Cloning $nodeName..." -ForegroundColor DarkCyan
      $cloneArgs = @('clone', '--depth', '1')
      if ($node.PSObject.Properties['branch'] -and $node.branch) {
        $cloneArgs += @('--branch', $node.branch)
      }
      $cloneArgs += @($nodeUrl, $nodeDest)
      & $git @cloneArgs
      if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: Failed to clone $nodeName" -ForegroundColor Yellow
        continue
      }
    }

    # Install requirements if present
    $reqPath = Join-Path $nodeDest "requirements.txt"
    if (Test-Path $reqPath) {
      Write-Host "  Installing requirements for $nodeName..." -ForegroundColor DarkCyan
      # Pre-install insightface from prebuilt wheel (no official Windows wheel on PyPI)
      $reqContent = Get-Content $reqPath -Raw
      if ($reqContent -match 'insightface') {
        Write-Host "  Pre-installing insightface from prebuilt wheel..." -ForegroundColor DarkCyan
        & $envInfo.UvPath pip install -p $envInfo.PythonPath "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp312-cp312-win_amd64.whl" 2>&1 | Out-Null
      }
      $output = & $envInfo.UvPath pip install -p $envInfo.PythonPath -r $reqPath --no-cache 2>&1
      if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: Failed to install requirements for $nodeName" -ForegroundColor Yellow
        Write-Host "  Error: $output" -ForegroundColor Red
      }
    }
  }

  Write-Host "Custom nodes installation complete." -ForegroundColor Green
}

function Download-AllFiles($vendorDir, $comfyDir) {
  Write-Header "Downloading Files"

  $configPath = Join-Path (Get-Location) "config\downloads.json"

  if (-not (Test-Path $configPath)) {
    Write-Host "Warning: config/downloads.json not found, skipping file downloads." -ForegroundColor Yellow
    return
  }

  $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
  # Get all non-custom-node and non-manual items (manual items require CivitAI login)
  $files = $config.items | Where-Object { $_.category -ne "custom-node" -and $_.category -ne "manual" }

  if ($files.Count -eq 0) {
    Write-Host "No files to download." -ForegroundColor Green
    return
  }

  $total = $files.Count
  $completed = 0

  foreach ($file in $files) {
    $completed++
    $destPath = Join-Path $comfyDir $file.destRelativeToComfy
    $filename = $file.filename
    $label = $file.label

    Write-Host "[$completed/$total] $label" -ForegroundColor DarkCyan

    if (Test-Path $destPath) {
      Write-Host "  Already exists, skipping." -ForegroundColor Green
      continue
    }

    # Ensure parent directory exists
    $parentDir = Split-Path -Parent $destPath
    New-DirectoryIfMissing $parentDir

    # Try each URL until one succeeds, with retries
    $downloaded = $false
    $maxRetries = 3
    foreach ($url in $file.urls) {
      for ($retry = 1; $retry -le $maxRetries; $retry++) {
        try {
          if ($retry -eq 1) {
            Write-Host "  Downloading from: $url" -ForegroundColor DarkCyan
          } else {
            Write-Host "  Retry $retry/$maxRetries..." -ForegroundColor Yellow
          }

          # Clean up partial download
          if (Test-Path $destPath) { Remove-Item $destPath -Force -ErrorAction SilentlyContinue }

          # Use curl for large files (better progress, supports resume)
          if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            & curl.exe -A "Mozilla/5.0" -L --fail --progress-bar --retry 2 --retry-delay 3 "$url" -o "$destPath"
            if ($LASTEXITCODE -eq 0 -and (Test-Path $destPath)) {
              $downloaded = $true
              break
            }
          } else {
            Invoke-WebRequest -Uri $url -OutFile $destPath -Headers @{ 'User-Agent' = 'Mozilla/5.0' } -MaximumRedirection 10
            if (Test-Path $destPath) {
              $downloaded = $true
              break
            }
          }
        } catch {
          Write-Host "  Download failed: $_" -ForegroundColor Yellow
          if (Test-Path $destPath) { Remove-Item $destPath -Force -ErrorAction SilentlyContinue }
        }

        if (-not $downloaded -and $retry -lt $maxRetries) {
          Write-Host "  Waiting 5 seconds before retry..." -ForegroundColor Yellow
          Start-Sleep -Seconds 5
        }
      }

      if ($downloaded) { break }
      Write-Host "  Failed from $url, trying next URL..." -ForegroundColor Yellow
    }

    if ($downloaded) {
      Write-Host "  Downloaded successfully." -ForegroundColor Green
    } else {
      Write-Host "  Warning: Failed to download $filename after $maxRetries retries" -ForegroundColor Yellow
    }
  }

  Write-Host "File downloads complete." -ForegroundColor Green

  # Manual download required for files that need login
  Show-ManualDownloadInstructions -comfyDir $comfyDir
}

function Show-ManualDownloadInstructions($comfyDir) {
  $configPath = Join-Path (Get-Location) "config\downloads.json"
  if (-not (Test-Path $configPath)) { return }

  $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
  $manualItems = $config.items | Where-Object { $_.category -eq "manual" }

  if ($manualItems.Count -eq 0) { return }

  $missing = @()
  foreach ($item in $manualItems) {
    $destPath = Join-Path $comfyDir $item.destRelativeToComfy
    if (-not (Test-Path $destPath)) {
      $missing += $item
    }
  }

  if ($missing.Count -eq 0) { return }

  Write-Header "Manual Downloads Required"
  Write-Host "The following files require a CivitAI account to download:" -ForegroundColor Yellow
  Write-Host ""

  foreach ($item in $missing) {
    $destPath = Join-Path $comfyDir $item.destRelativeToComfy
    Write-Host "  - $($item.label)" -ForegroundColor Cyan
    Write-Host "    URL: $($item.pageUrl)" -ForegroundColor Yellow
    Write-Host "    File: $($item.filename)" -ForegroundColor DarkCyan
    Write-Host "    Save to: $destPath" -ForegroundColor DarkCyan
    Write-Host ""
  }

  Write-Host "Please download the file(s) from the URLs above and place them in the specified location." -ForegroundColor Yellow
  Write-Host "Press any key to continue after downloading..." -ForegroundColor Yellow
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Install-Nunchaku($vendorDir, $comfyDir, $envInfo) {
  Write-Header "Nunchaku"

  $py = $envInfo.PythonPath
  $uv = $envInfo.UvPath

  # Install nunchaku from GitHub releases (not available on PyPI due to file size)
  # Use v1.0.1 + torch2.8 for compatibility with ComfyUI (torch 2.9.1)
  $nunchakuVersion = "1.0.1"
  $wheelUrl = "https://github.com/mit-han-lab/nunchaku/releases/download/v1.0.1/nunchaku-1.0.1%2Btorch2.8-cp312-cp312-win_amd64.whl"

  Write-Host "Installing Nunchaku runtime v$nunchakuVersion from GitHub releases..." -ForegroundColor DarkCyan
  Write-Host "  URL: $wheelUrl" -ForegroundColor DarkCyan

  try {
    $output = & $uv pip install -p $py $wheelUrl 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Nunchaku v$nunchakuVersion installed successfully." -ForegroundColor Green

      # Reinstall insightface to fix numpy binary compatibility issue
      Write-Host "Reinstalling insightface to fix numpy compatibility..." -ForegroundColor DarkCyan
      & $uv pip install -p $py --force-reinstall "https://github.com/Gourieff/Assets/raw/main/Insightface/insightface-0.7.3-cp312-cp312-win_amd64.whl" 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "Insightface reinstalled successfully." -ForegroundColor Green
      }
    } else {
      Write-Host "Warning: Failed to install nunchaku v$nunchakuVersion" -ForegroundColor Yellow
      Write-Host "Error: $output" -ForegroundColor Red
    }
  } catch {
    Write-Host "Warning: Nunchaku installation failed: $_" -ForegroundColor Yellow
  }
}

# ============================================================================
# MAIN
# ============================================================================

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  Write-Host "`n========================================" -ForegroundColor Cyan
  Write-Host "  Tag Painter Bootstrap Installation" -ForegroundColor Cyan
  Write-Host "========================================`n" -ForegroundColor Cyan

  # Debug: Show working directory
  Write-Host "Working directory: $(Get-Location)" -ForegroundColor Magenta
  Write-Host "PSScriptRoot: $PSScriptRoot" -ForegroundColor Magenta

  New-DirectoryIfMissing "vendor"
  $vendorDir = Resolve-Path "vendor"
  $comfyDir = Join-Path (Get-Location) $ComfyDir

  Write-Host "Vendor dir: $vendorDir" -ForegroundColor Magenta
  Write-Host "ComfyUI dir: $comfyDir" -ForegroundColor Magenta

  # Step 1: Node.js
  $nodeHome = Install-Node -vendorDir $vendorDir

  # Step 2: Git
  $gitHome = Install-Git -vendorDir $vendorDir

  # Step 3: uv
  $uvPath = Install-Uv -vendorDir $vendorDir

  # Step 4: ComfyUI source
  Install-ComfyUISource -vendorDir $vendorDir -comfyDir $comfyDir -gitHome $gitHome

  # Step 5: Python venv + dependencies
  $envInfo = Initialize-PythonVenv -vendorDir $vendorDir -comfyDir $comfyDir -pythonVersion $PythonVersion -ForceCpuMode:$ForceCPU -uvPath $uvPath

  # If envInfo is an array (due to function output), take the last element (the hashtable)
  if ($envInfo -is [Array]) {
    $envInfo = $envInfo[-1]
  }

  if (-not $envInfo -or -not $envInfo.PythonPath) {
    throw "Failed to initialize Python environment"
  }

  # Step 6: Custom nodes
  Install-CustomNodes -vendorDir $vendorDir -comfyDir $comfyDir -gitHome $gitHome -envInfo $envInfo

  # Step 7: Download all files
  Download-AllFiles -vendorDir $vendorDir -comfyDir $comfyDir

  # Step 8: Nunchaku runtime installation
  Install-Nunchaku -vendorDir $vendorDir -comfyDir $comfyDir -envInfo $envInfo

  Write-Host "`n========================================" -ForegroundColor Green
  Write-Host "  Bootstrap Complete!" -ForegroundColor Green
  Write-Host "========================================`n" -ForegroundColor Green

} finally {
  Pop-Location
}
