param(
  [int]$Port = 3000,
  [string]$ComfyDir = "vendor\\ComfyUI",
  [switch]$OpenBrowser,
  [switch]$ForceCPU,
  [switch]$ComfyOnly,
  [switch]$NoComfy,
  [switch]$Help
)

<#
  Start ComfyUI + Node server
  - Detects NVIDIA GPU and picks run_nvidia_gpu.bat or run_cpu.bat for ComfyUI Portable
  - Starts ComfyUI, waits for port 8188 to respond
  - Starts Node server (adapter-node build) on -Port (default 3000)
  - Use -ComfyOnly flag to start only ComfyUI without the Node server
  - Use -NoComfy flag to skip ComfyUI installation and assume it's already running
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Trap for handling parameter binding errors (unknown parameters)
trap {
  if ($_.Exception -is [System.Management.Automation.ParameterBindingException]) {
    Write-Host "ERROR: Unknown parameter or invalid usage." -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Show-Help
    exit 1
  }
  throw
}

function Show-Help {
  Write-Host "Tag Painter - Start Script" -ForegroundColor Cyan
  Write-Host "Starts ComfyUI and/or the Tag Painter web application" -ForegroundColor White
  Write-Host ""
  Write-Host "USAGE:" -ForegroundColor Yellow
  Write-Host "  .\scripts\start.ps1 [OPTIONS]" -ForegroundColor White
  Write-Host ""
  Write-Host "OPTIONS:" -ForegroundColor Yellow
  Write-Host "  -Port <number>     Port for the web server (default: 3000)" -ForegroundColor White
  Write-Host "  -ComfyDir <path>   ComfyUI directory path (default: vendor\ComfyUI)" -ForegroundColor White
  Write-Host "  -OpenBrowser       Open browser automatically after starting" -ForegroundColor White
  Write-Host "  -ForceCPU          Force CPU mode for ComfyUI (disable GPU)" -ForegroundColor White
  Write-Host "  -ComfyOnly         Start only ComfyUI without the web server" -ForegroundColor White
  Write-Host "  -NoComfy           Skip ComfyUI installation/startup (assume already running)" -ForegroundColor White
  Write-Host "  -Help              Show this help message" -ForegroundColor White
  Write-Host ""
  Write-Host "EXAMPLES:" -ForegroundColor Yellow
  Write-Host "  .\scripts\start.ps1                    # Start both ComfyUI and web server" -ForegroundColor Gray
  Write-Host "  .\scripts\start.ps1 -Port 8080         # Use port 8080 for web server" -ForegroundColor Gray
  Write-Host "  .\scripts\start.ps1 -ComfyOnly         # Start only ComfyUI" -ForegroundColor Gray
  Write-Host "  .\scripts\start.ps1 -NoComfy           # Skip ComfyUI, start only web server" -ForegroundColor Gray
  Write-Host "  .\scripts\start.ps1 -ForceCPU          # Use CPU mode for ComfyUI" -ForegroundColor Gray
  Write-Host ""
}

if ($args.Count -gt 0) {
  Write-Host "ERROR: Unsupported option(s): $($args -join ', ')" -ForegroundColor Red
  Write-Host ""
  Show-Help
  exit 1
}

function Write-Header($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function New-DirectoryIfMissing($path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}

function Test-Http($url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $resp.StatusCode -ge 200
  } catch { return $false }
}

function Invoke-Bootstrap {
  param(
    [string[]]$BootstrapArgs
  )
  $scriptPath = Resolve-Path "scripts\\bootstrap.ps1"
  $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwshCmd) {
    & $pwshCmd.Path -File $scriptPath @BootstrapArgs
    if ($LASTEXITCODE -ne 0) { throw "bootstrap.ps1 failed (pwsh exit code $LASTEXITCODE)" }
    return
  }

  $powershellCmd = Get-Command powershell -ErrorAction SilentlyContinue
  if ($powershellCmd) {
    & $powershellCmd.Path -ExecutionPolicy Bypass -File $scriptPath @BootstrapArgs
    if ($LASTEXITCODE -ne 0) { throw "bootstrap.ps1 failed (powershell exit code $LASTEXITCODE)" }
    return
  }

  & $scriptPath @BootstrapArgs
}

function Install-PythonPackages($venvPy, [string[]]$packages) {
  try { & $venvPy -m ensurepip --upgrade } catch {}
  $pipOk = $false
  try { & $venvPy -m pip --version | Out-Null; if ($LASTEXITCODE -eq 0) { $pipOk = $true } } catch {}
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
    try { & $venvPy -c $code | Out-Null; if ($LASTEXITCODE -eq 0) { $ok = $true } } catch { $ok = $false }
    if (-not $ok) {
      Write-Host "Installing Python package: $pkg" -ForegroundColor DarkCyan
      if ($pipOk) {
        & $venvPy -m pip install $pkg
      } else {
        $uvExe = Join-Path (Resolve-Path "vendor") "uv.exe"
        if (Test-Path $uvExe) { & $uvExe pip install -p $venvPy $pkg } else { Write-Host "Cannot install $pkg (pip/uv missing)." -ForegroundColor Yellow }
      }
    }
  }
}

function Get-ModelIfMissing($url, $destPath) {
  if (Test-Path $destPath) {
    $fileSize = (Get-Item $destPath).Length
    if ($fileSize -gt 1MB) {
      # Check if it's actually a model file, not HTML by reading first few characters as text
      try {
        $fileStart = Get-Content $destPath -TotalCount 1 -Raw -ErrorAction SilentlyContinue
        if ($fileStart -and -not $fileStart.StartsWith('<')) {
          Write-Host "Model already exists: $(Split-Path $destPath -Leaf) ($([math]::Round($fileSize/1MB, 2)) MB)" -ForegroundColor Green
          return
        } else {
          Write-Host "Existing file appears to be HTML/text, re-downloading: $(Split-Path $destPath -Leaf)" -ForegroundColor Yellow
          Remove-Item $destPath -Force -ErrorAction SilentlyContinue
        }
      } catch {
        # If we can't read as text, assume it's binary (good)
        Write-Host "Model already exists: $(Split-Path $destPath -Leaf) ($([math]::Round($fileSize/1MB, 2)) MB)" -ForegroundColor Green
        return
      }
    } else {
      Write-Host "Model file too small, re-downloading: $(Split-Path $destPath -Leaf)" -ForegroundColor Yellow
      Remove-Item $destPath -Force -ErrorAction SilentlyContinue
    }
  }
  
  $destDir = Split-Path $destPath -Parent
  New-DirectoryIfMissing $destDir
  
  Write-Host "Downloading model: $(Split-Path $destPath -Leaf)" -ForegroundColor DarkCyan
  try {
    Invoke-WebRequest -Uri $url -OutFile $destPath -Headers @{ 'User-Agent' = 'Mozilla/5.0' } -MaximumRedirection 10
    if (Test-Path $destPath) {
      $fileSize = (Get-Item $destPath).Length
      # Check if downloaded file is actually a model file, not HTML error page
      $isValidModel = $false
      try {
        $fileStart = Get-Content $destPath -TotalCount 1 -Raw -ErrorAction SilentlyContinue
        if ($fileSize -gt 1MB -and ($null -eq $fileStart -or -not $fileStart.StartsWith('<'))) {
          $isValidModel = $true
        }
      } catch {
        # If we can't read as text and file is large enough, assume it's binary (good)
        if ($fileSize -gt 1MB) { $isValidModel = $true }
      }
      
      if ($isValidModel) {
        Write-Host "Model downloaded successfully: $(Split-Path $destPath -Leaf) ($([math]::Round($fileSize/1MB, 2)) MB)" -ForegroundColor Green
        return
      } else {
        # File is too small or starts with '<' (HTML), likely an error page
        Remove-Item $destPath -Force -ErrorAction SilentlyContinue
        throw "Downloaded file appears to be HTML error page or too small"
      }
    }
  } catch {
    # Download failed, clean up any partial file
    if (Test-Path $destPath) {
      Remove-Item $destPath -Force -ErrorAction SilentlyContinue
    }
  }
  
  Write-Host "Failed to download model from $url" -ForegroundColor Red
  Write-Host "Please download manually and place in: $destPath" -ForegroundColor Yellow
}

function Install-TorchCudaIfNeeded($venvPy) {
  # If NVIDIA GPU present but torch lacks CUDA, install CUDA-enabled torch
  $hasNvidia = $false
  try { Get-Command nvidia-smi -ErrorAction SilentlyContinue | Out-Null; $hasNvidia = $true } catch {}
  if (-not $hasNvidia) { return $false }

  $cudaOk = $false
  try {
    & $venvPy -c "import sys, torch; sys.exit(0 if (getattr(torch,'cuda',None) and torch.version.cuda and torch.cuda.is_available()) else 1)"
    if ($LASTEXITCODE -eq 0) { $cudaOk = $true }
  } catch { $cudaOk = $false }

  if ($cudaOk) { return $true }

  Write-Host "Installing/upgrading PyTorch CUDA build for NVIDIA..." -ForegroundColor DarkCyan
  try { & $venvPy -m ensurepip --upgrade } catch {}
  $pipOk = $false
  try { & $venvPy -m pip --version | Out-Null; if ($LASTEXITCODE -eq 0) { $pipOk = $true } } catch {}
  $indexes = @(
    'https://download.pytorch.org/whl/cu126',
    'https://download.pytorch.org/whl/cu124',
    'https://download.pytorch.org/whl/cu121'
  )
  $installed = $false
  foreach ($ix in $indexes) {
    Write-Host "Trying CUDA wheel index: $ix" -ForegroundColor DarkCyan
    if ($pipOk) {
      & $venvPy -m pip install --upgrade --force-reinstall --no-cache-dir torch torchvision torchaudio --index-url $ix
    } else {
      $uvExe = Join-Path (Resolve-Path "vendor") "uv.exe"
      if (Test-Path $uvExe) {
        & $uvExe pip install -p $venvPy --reinstall --no-cache torch torchvision torchaudio --index-url $ix
      } else {
        Write-Host "pip unavailable and uv.exe not found; cannot install CUDA Torch automatically." -ForegroundColor Yellow
        break
      }
    }
    if ($LASTEXITCODE -eq 0) { $installed = $true; break }
  }

  $cudaOk2 = $false
  if ($installed) {
    try {
      & $venvPy -c "import sys, torch; sys.exit(0 if (getattr(torch,'cuda',None) and torch.version.cuda and torch.cuda.is_available()) else 1)"
      if ($LASTEXITCODE -eq 0) { $cudaOk2 = $true }
    } catch { $cudaOk2 = $false }
  }
  return $cudaOk2
}

function Start-ComfyUI($dir, [switch]$Cpu) {
  if (-not (Test-Path $dir)) {
    Write-Host "ComfyUI not found at $dir" -ForegroundColor Yellow
    return $null
  }

  # Try source install path using venv Python
  $venvPy = Join-Path (Resolve-Path "vendor") "comfy-venv\\Scripts\\python.exe"
  if (Test-Path $venvPy) {
    Write-Host "Starting ComfyUI via venv python..." -ForegroundColor DarkCyan
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $venvPy
    $extra = if ($Cpu) { " --cpu" } else { "" }
        # Prevent ComfyUI from auto-opening a browser (windows-standalone-build enables it by default)
        $psi.Arguments = ("-s main.py --windows-standalone-build --disable-auto-launch --listen 0.0.0.0 --enable-cors-header `"*`"" + $extra)
    $psi.WorkingDirectory = (Resolve-Path $dir)
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    return $p
  }

  Write-Host "No embedded or venv Python found for ComfyUI. Run scripts\\bootstrap.ps1 first." -ForegroundColor Yellow
  return $null
}

function Wait-For-Port8188() {
  Write-Host "Waiting for ComfyUI on http://127.0.0.1:8188 ..." -ForegroundColor DarkCyan
  $max = 90
  for ($i=0; $i -lt $max; $i++) {
    if (Test-Http "http://127.0.0.1:8188/") { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Start-NodeServer($port) {
  $env:PORT = "$port"
  # Increase SvelteKit request body size limit (bytes) to allow PNG uploads
  if (-not $env:BODY_SIZE_LIMIT) { $env:BODY_SIZE_LIMIT = "52428800" } # 50 MB
  # Ensure production mode so hooks relying on NODE_ENV work as intended
  if (-not $env:NODE_ENV) { $env:NODE_ENV = "production" }

  $node = "node"
  if (Test-Path "vendor\\node\\node.exe") { $node = (Resolve-Path "vendor\\node\\node.exe") }

  if (-not (Test-Path "build\\index.js")) {
    Write-Host "Missing build output. Please build the app first (npm run build) or use a release ZIP including build/." -ForegroundColor Yellow
    return $null
  }

  Write-Host "Starting Node server on http://127.0.0.1:$port ..." -ForegroundColor DarkCyan
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  $psi.Arguments = "build\\index.js"
  $psi.WorkingDirectory = (Resolve-Path ".")
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $false
  $psi.RedirectStandardError = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  return $p
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  # Show help if requested
  if ($Help) {
    Show-Help
    exit 0
  }

  # Validate conflicting parameters
  if ($ComfyOnly -and $NoComfy) {
    Write-Host "ERROR: -ComfyOnly and -NoComfy cannot be used together." -ForegroundColor Red
    Write-Host ""
    Show-Help
    exit 1
  }

  Write-Header "Prerequisite check"
  New-DirectoryIfMissing "vendor"

  # Check if this is a fresh release or if dependencies are incomplete (e.g., missing sharp)
  $needsNodeDeps = $false
  if (Test-Path "build\\index.js") {
    if (-not (Test-Path "node_modules")) {
      $needsNodeDeps = $true
    } elseif (-not (Test-Path "node_modules\\sharp")) {
      $needsNodeDeps = $true
      Write-Host "Detected missing 'sharp' dependency. Reinstalling Node dependencies..." -ForegroundColor Yellow
    }
  }

  if ($needsNodeDeps) {
    Write-Header "Setting up release dependencies"

    if ($NoComfy) {
      Write-Host "Running bootstrap to prepare environment (Node only, skipping ComfyUI)..." -ForegroundColor DarkCyan
    } else {
      Write-Host "Running bootstrap to prepare environment (Node, ComfyUI)..." -ForegroundColor DarkCyan
    }

    $bootstrapArgs = @('-SkipBuild')
    if ($NoComfy) { $bootstrapArgs += '-SkipComfy' }
    Invoke-Bootstrap -bootstrapArgs $bootstrapArgs

    # Ensure Node deps are installed without rebuilding app
    Write-Host "Installing Node dependencies (npm ci)..." -ForegroundColor DarkCyan
    $npm = "npm"
    $vendorNpm = Join-Path (Resolve-Path "vendor") "node\\npm.cmd"
    if (Test-Path $vendorNpm) { $npm = $vendorNpm }
    & $npm ci
    if ($LASTEXITCODE -ne 0) {
      Write-Host "npm ci failed. Falling back to 'npm install'." -ForegroundColor Yellow
      & $npm install
    }
  }

  # Configure ComfyUI (source install only)
  $useCpu = $ForceCPU
  $comfy = $null

  if (-not $NoComfy) {
    # Ensure ComfyUI + venv exist; run bootstrap (without building app) if missing
    $venvPy = Join-Path (Resolve-Path "vendor") "comfy-venv\\Scripts\\python.exe"
    $needsBootstrap = $false

    if (-not (Test-Path $ComfyDir) -or -not (Test-Path $venvPy)) {
      $needsBootstrap = $true
      Write-Host "ComfyUI or Python venv missing. Running bootstrap..." -ForegroundColor DarkCyan
    }

    if ($needsBootstrap) {
      Write-Header "Setting up ComfyUI (latest source)"
      Invoke-Bootstrap -bootstrapArgs @('-SkipBuild')
    }

    # Ensure CUDA-enabled torch is installed when NVIDIA is present; decide CPU fallback
    if (-not $useCpu -and (Test-Path $venvPy)) {
      $ok = Install-TorchCudaIfNeeded -venvPy $venvPy
      if (-not $ok) {
        Write-Host "CUDA Torch not available. Use -ForceCPU to run on CPU, or ensure NVIDIA drivers/CUDA are installed." -ForegroundColor Yellow
      }
    }
    if ($useCpu) {
      $env:CUDA_VISIBLE_DEVICES = "-1"
      Write-Host "CPU mode active (either forced or CUDA not available)." -ForegroundColor Yellow
    } else {
      Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue
    }

    # Ensure common extras used by custom nodes and check custom node dependencies
    if (Test-Path $venvPy) {
      Install-PythonPackages -venvPy $venvPy -packages @('matplotlib')

      # Check and install custom node dependencies if missing
      $customNodesDir = Join-Path $ComfyDir "custom_nodes"
      if (Test-Path $customNodesDir) {
        $customNodes = Get-ChildItem -Path $customNodesDir -Directory
        foreach ($node in $customNodes) {
          $requirementsFile = Join-Path $node.FullName "requirements.txt"
          if (Test-Path $requirementsFile) {
            Write-Host "Checking dependencies for $($node.Name)..." -ForegroundColor DarkCyan
            $uvExe = Join-Path (Resolve-Path "vendor") "uv.exe"
            if (Test-Path $uvExe) {
              & $uvExe pip install -p $venvPy -r $requirementsFile
            } else {
              & $venvPy -m pip install -r $requirementsFile
            }
          }
        }
      }
    }

    Write-Header "Start ComfyUI"
    $comfy = Start-ComfyUI -dir $ComfyDir -Cpu:$useCpu
    if (-not (Wait-For-Port8188)) {
      Write-Host "ComfyUI did not respond on 8188 in time. You may still continue if starting manually." -ForegroundColor Yellow
    }
  } else {
    # NoComfy mode - assume ComfyUI is already running
    Write-Host "Skipping ComfyUI setup (NoComfy mode). Assuming ComfyUI is already running at http://127.0.0.1:8188" -ForegroundColor Yellow
  }

  if ($ComfyOnly) {
    # ComfyUI-only mode
    if ($NoComfy) {
      Write-Host "ComfyUI-only mode with NoComfy option. Assuming ComfyUI is already running at http://127.0.0.1:8188" -ForegroundColor Green
    } elseif ($comfy) {
      Write-Host "ComfyUI PID: $($comfy.Id)" -ForegroundColor Green
      Write-Host "ComfyUI is running at http://127.0.0.1:8188" -ForegroundColor Cyan
    } else {
      Write-Host "ComfyUI not started (portable scripts or venv python missing)" -ForegroundColor Yellow
    }
    Write-Host "Press Ctrl+C to stop ComfyUI (or close the console)." -ForegroundColor Yellow
  } else {
    # Full mode with app server
    Write-Header "Start App Server"
    $app = Start-NodeServer -port $Port

    Start-Process "http://127.0.0.1:$Port"

    if ($NoComfy) {
      Write-Host "ComfyUI: Assuming already running at http://127.0.0.1:8188" -ForegroundColor Green
    } elseif ($comfy) {
      Write-Host "ComfyUI PID: $($comfy.Id)" -ForegroundColor Green
    } else {
      Write-Host "ComfyUI not started (portable scripts or venv python missing)" -ForegroundColor Yellow
    }
    if ($app) {
      Write-Host "App server PID: $($app.Id)" -ForegroundColor Green
    } else {
      Write-Host "App server not started" -ForegroundColor Yellow
    }
    Write-Host "Press Ctrl+C to stop (or close the console)." -ForegroundColor Yellow
  }

  # Keep foreground process alive while children run
  while ($true) { Start-Sleep -Seconds 3600 }
} finally {
  Pop-Location
}
