param(
  [string]$NodeVersion = "24.11.1",
  [string]$NodeZipUrl = "https://nodejs.org/dist/v24.11.1/node-v24.11.1-win-x64.zip",
  [string]$ComfyDir = "vendor\ComfyUI",
  [string]$ComfyPortableUrl = "https://github.com/Comfy-Org/ComfyUI/releases/download/v0.11.0/ComfyUI_windows_portable_nvidia_cu128.7z",
  [switch]$SkipNode
)

<#
  Windows bootstrap script - Complete installation
  - Installs portable Git (MinGit) if system Git is not available
  - Installs Node v$NodeVersion locally (portable) if not available
  - Downloads and extracts ComfyUI portable version (includes embedded Python)
  - Installs all custom nodes from config/downloads.json
  - Downloads all required files (models, VAEs, etc.)
  - Installs Nunchaku runtime

  Usage examples:
    pwsh -File scripts/bootstrap.ps1
    pwsh -File scripts/bootstrap.ps1 -SkipNode
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

function Get-7ZipPath($vendorDir) {
  # Check for system-installed 7-Zip
  $systemPaths = @(
    "${env:ProgramFiles}\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
  )
  foreach ($path in $systemPaths) {
    if (Test-Path $path) { return $path }
  }

  # Use portable 7-Zip
  $sevenZipDir = Join-Path $vendorDir "7zip"
  $sevenZipExe = Join-Path $sevenZipDir "7za.exe"

  if (-not (Test-Path $sevenZipExe)) {
    Write-Host "Installing portable 7-Zip..." -ForegroundColor DarkCyan
    New-DirectoryIfMissing $sevenZipDir

    # Download 7-Zip standalone console version
    $sevenZipUrl = "https://www.7-zip.org/a/7za920.zip"
    $sevenZipZip = Join-Path $vendorDir "7za.zip"

    Save-UrlIfMissing $sevenZipUrl $sevenZipZip
    Expand-Archive -Path $sevenZipZip -DestinationPath $sevenZipDir -Force
    Remove-Item $sevenZipZip -ErrorAction SilentlyContinue

    if (-not (Test-Path $sevenZipExe)) {
      throw "Failed to install 7-Zip"
    }
  }

  return $sevenZipExe
}

function Expand-7z-To($archivePath, $destDir, $vendorDir) {
  Write-Host "Extracting 7z: $archivePath -> $destDir" -ForegroundColor DarkCyan
  if (Test-Path $destDir) { Remove-Item -Recurse -Force $destDir }
  New-DirectoryIfMissing $destDir

  $sevenZip = Get-7ZipPath $vendorDir
  & $sevenZip x "$archivePath" -o"$destDir" -y
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to extract $archivePath"
  }
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

function Install-ComfyUIPortable($vendorDir, $comfyDir, $portableUrl) {
  Write-Header "ComfyUI Portable"

  $pythonDir = Join-Path $vendorDir "python_embeded"

  if ((Test-Path $comfyDir) -and (Test-Path $pythonDir)) {
    Write-Host "ComfyUI portable already present, skipping download." -ForegroundColor Green
    return
  }

  Write-Host "Downloading ComfyUI portable version..." -ForegroundColor DarkCyan
  Write-Host "  URL: $portableUrl" -ForegroundColor DarkCyan

  $archivePath = Join-Path $vendorDir "ComfyUI_portable.7z"
  $extractDir = Join-Path $vendorDir "ComfyUI_portable_extract"

  # Download the portable archive
  Save-UrlIfMissing $portableUrl $archivePath (100 * 1024 * 1024)  # Minimum 100MB expected

  # Extract the archive
  Expand-7z-To $archivePath $extractDir $vendorDir

  # The portable version extracts to ComfyUI_windows_portable/
  $portableRoot = Join-Path $extractDir "ComfyUI_windows_portable"
  if (-not (Test-Path $portableRoot)) {
    # Try to find the root folder
    $portableRoot = Get-ChildItem -Path $extractDir -Directory | Where-Object {
      (Test-Path (Join-Path $_.FullName "ComfyUI")) -and (Test-Path (Join-Path $_.FullName "python_embeded"))
    } | Select-Object -First 1
    if ($portableRoot) {
      $portableRoot = $portableRoot.FullName
    }
  }

  if (-not $portableRoot -or -not (Test-Path $portableRoot)) {
    throw "Could not find ComfyUI portable root folder in extracted archive"
  }

  $portableComfyDir = Join-Path $portableRoot "ComfyUI"
  $portablePythonDir = Join-Path $portableRoot "python_embeded"

  if (-not (Test-Path $portableComfyDir)) {
    throw "Could not find ComfyUI folder in extracted archive"
  }
  if (-not (Test-Path $portablePythonDir)) {
    throw "Could not find python_embeded folder in extracted archive"
  }

  # Move ComfyUI to the expected location
  Write-Host "Moving ComfyUI to $comfyDir..." -ForegroundColor DarkCyan
  if (Test-Path $comfyDir) { Remove-Item -Recurse -Force $comfyDir }
  Move-Item -Path $portableComfyDir -Destination $comfyDir

  # Move python_embeded to vendor folder
  Write-Host "Moving python_embeded to $pythonDir..." -ForegroundColor DarkCyan
  if (Test-Path $pythonDir) { Remove-Item -Recurse -Force $pythonDir }
  Move-Item -Path $portablePythonDir -Destination $pythonDir

  # Cleanup
  Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
  Remove-Item $archivePath -ErrorAction SilentlyContinue

  # Verify installation
  if (-not (Test-Path (Join-Path $comfyDir "main.py"))) {
    throw "ComfyUI installation failed - main.py not found in $comfyDir"
  }
  if (-not (Test-Path (Join-Path $pythonDir "python.exe"))) {
    throw "Python installation failed - python.exe not found in $pythonDir"
  }

  Write-Host "ComfyUI portable installed successfully." -ForegroundColor Green
  Write-Host "  ComfyUI: $comfyDir" -ForegroundColor Green
  Write-Host "  Python: $pythonDir" -ForegroundColor Green
}

function Get-EmbeddedPythonEnv($vendorDir) {
  Write-Header "Python Environment"

  $pythonDir = Join-Path $vendorDir "python_embeded"
  $py = Join-Path $pythonDir "python.exe"

  if (-not (Test-Path $py)) {
    throw "Embedded Python not found at $py"
  }

  # Verify Python is working
  Write-Host "Verifying embedded Python..." -ForegroundColor DarkCyan
  $pyVersion = & $py --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Embedded Python verification failed"
  }
  Write-Host "Embedded Python: $pyVersion" -ForegroundColor Green

  # Verify pip is available via python -m pip
  Write-Host "Verifying pip..." -ForegroundColor DarkCyan
  $pipVersion = & $py -m pip --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "pip not available, installing..." -ForegroundColor Yellow
    & $py -m ensurepip --upgrade 2>&1 | Out-Null
    $pipVersion = & $py -m pip --version 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install pip"
    }
  }
  Write-Host "Pip: $pipVersion" -ForegroundColor Green

  Write-Host "Python environment ready." -ForegroundColor Green

  return @{ PythonPath = $py; PythonDir = $pythonDir }
}

function Install-ComfyUIRequirements($comfyDir, $envInfo) {
  Write-Header "ComfyUI Requirements"

  # ComfyUI portable already includes all dependencies with CUDA-enabled PyTorch
  # Skip requirements.txt installation to avoid replacing CUDA PyTorch with CPU version
  Write-Host "ComfyUI portable includes all dependencies, skipping requirements.txt" -ForegroundColor Green
}

function Install-CustomNodes($vendorDir, $comfyDir, $gitHome, $envInfo) {
  Write-Header "Custom Nodes"

  $git = Join-Path $gitHome "cmd\git.exe"
  $py = $envInfo.PythonPath
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

      # Read requirements and filter out torch-related packages to preserve CUDA PyTorch
      $reqLines = @(Get-Content $reqPath)
      $filteredReqs = @($reqLines | Where-Object {
        $line = $_.Trim().ToLower()
        # Skip empty lines, comments, and torch-related packages
        -not [string]::IsNullOrWhiteSpace($line) -and
        -not $line.StartsWith('#') -and
        -not $line.StartsWith('torch') -and
        -not $line.StartsWith('insightface')  # Skip insightface (needs special handling)
      })

      if ($filteredReqs.Count -gt 0) {
        # Create a temporary filtered requirements file
        $tempReqPath = Join-Path $nodeDest "requirements_filtered.txt"
        $filteredReqs | Set-Content $tempReqPath

        $output = & $py -m pip install -r $tempReqPath 2>&1
        Remove-Item $tempReqPath -ErrorAction SilentlyContinue

        if ($LASTEXITCODE -ne 0) {
          Write-Host "  Warning: Some requirements failed to install for $nodeName" -ForegroundColor Yellow
        }
      } else {
        Write-Host "  No additional requirements needed (torch packages skipped)" -ForegroundColor Green
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

function Repair-PyTorchCuda($envInfo) {
  Write-Header "PyTorch CUDA Repair"

  $py = $envInfo.PythonPath

  # Check if PyTorch CUDA is working
  Write-Host "Checking PyTorch CUDA status..." -ForegroundColor DarkCyan
  $cudaCheck = & $py -c "import torch; print('CUDA' if torch.cuda.is_available() else 'CPU')" 2>&1

  if ($cudaCheck -eq "CUDA") {
    Write-Host "PyTorch CUDA is working correctly." -ForegroundColor Green
    return
  }

  Write-Host "PyTorch CUDA not available, reinstalling with CUDA 12.8 support..." -ForegroundColor Yellow

  # Uninstall existing torch packages
  Write-Host "Uninstalling existing PyTorch packages..." -ForegroundColor DarkCyan
  & $py -m pip uninstall torch torchvision torchaudio -y 2>&1 | Out-Null

  # Install PyTorch with CUDA 12.8
  Write-Host "Installing PyTorch with CUDA 12.8..." -ForegroundColor DarkCyan
  $output = & $py -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 2>&1

  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: PyTorch CUDA installation may have issues" -ForegroundColor Yellow
    Write-Host "Output: $output" -ForegroundColor Yellow
  } else {
    # Verify installation
    $cudaVerify = & $py -c "import torch; print('CUDA' if torch.cuda.is_available() else 'CPU')" 2>&1
    if ($cudaVerify -eq "CUDA") {
      Write-Host "PyTorch CUDA 12.8 installed and verified successfully." -ForegroundColor Green
    } else {
      Write-Host "Warning: PyTorch installed but CUDA still not available" -ForegroundColor Yellow
    }
  }
}

function Install-HelperPackages($envInfo) {
  Write-Header "Helper Packages"

  $py = $envInfo.PythonPath

  Write-Host "Installing helper Python packages (pandas, matplotlib, onnxruntime-gpu)..." -ForegroundColor DarkCyan

  # Install pandas and matplotlib (required by some custom nodes)
  & $py -m pip install --upgrade pandas matplotlib 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Some helper packages may have failed to install" -ForegroundColor Yellow
  }

  # Try to install onnxruntime-gpu, fallback to CPU version
  $output = & $py -m pip install --upgrade onnxruntime-gpu 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "onnxruntime-gpu not available, installing CPU version..." -ForegroundColor Yellow
    & $py -m pip install --upgrade onnxruntime 2>&1 | Out-Null
  }

  Write-Host "Helper packages installed." -ForegroundColor Green
}

function Install-Nunchaku($vendorDir, $comfyDir, $envInfo) {
  Write-Header "Nunchaku"

  $py = $envInfo.PythonPath

  # Install nunchaku from GitHub releases (not available on PyPI due to file size)
  # Use v1.0.1 + torch2.8 for compatibility with ComfyUI portable (torch 2.8)
  # IMPORTANT: Use --no-deps to avoid replacing CUDA PyTorch with CPU version
  $nunchakuVersion = "1.0.1"
  $wheelUrl = "https://github.com/mit-han-lab/nunchaku/releases/download/v1.0.1/nunchaku-1.0.1%2Btorch2.8-cp312-cp312-win_amd64.whl"

  Write-Host "Installing Nunchaku runtime v$nunchakuVersion from GitHub releases..." -ForegroundColor DarkCyan
  Write-Host "  URL: $wheelUrl" -ForegroundColor DarkCyan

  try {
    # Use --no-deps to preserve existing CUDA PyTorch installation
    $output = & $py -m pip install --no-deps $wheelUrl 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Nunchaku v$nunchakuVersion installed successfully." -ForegroundColor Green
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

  # Step 2: Git (needed for custom nodes)
  $gitHome = Install-Git -vendorDir $vendorDir

  # Step 3: ComfyUI portable (includes Python)
  Install-ComfyUIPortable -vendorDir $vendorDir -comfyDir $comfyDir -portableUrl $ComfyPortableUrl

  # Step 4: Get embedded Python environment
  $envInfo = Get-EmbeddedPythonEnv -vendorDir $vendorDir

  # If envInfo is an array (due to function output), take the last element (the hashtable)
  if ($envInfo -is [Array]) {
    $envInfo = $envInfo[-1]
  }

  if (-not $envInfo -or -not $envInfo.PythonPath) {
    throw "Failed to initialize Python environment"
  }

  # Step 5: Install ComfyUI requirements
  Install-ComfyUIRequirements -comfyDir $comfyDir -envInfo $envInfo

  # Step 6: Custom nodes
  Install-CustomNodes -vendorDir $vendorDir -comfyDir $comfyDir -gitHome $gitHome -envInfo $envInfo

  # Step 7: Repair PyTorch CUDA (in case custom nodes broke it)
  Repair-PyTorchCuda -envInfo $envInfo

  # Step 8: Install helper packages (pandas, matplotlib, onnxruntime)
  Install-HelperPackages -envInfo $envInfo

  # Step 9: Download all files
  Download-AllFiles -vendorDir $vendorDir -comfyDir $comfyDir

  # Step 10: Nunchaku runtime installation
  Install-Nunchaku -vendorDir $vendorDir -comfyDir $comfyDir -envInfo $envInfo

  Write-Host "`n========================================" -ForegroundColor Green
  Write-Host "  Bootstrap Complete!" -ForegroundColor Green
  Write-Host "========================================`n" -ForegroundColor Green

} finally {
  Pop-Location
}
