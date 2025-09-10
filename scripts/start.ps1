param(
  [int]$Port = 3000,
  [string]$ComfyDir = "vendor\\ComfyUI",
  [string]$ComfyPortableUrl = $env:COMFY_PORTABLE_URL,
  [switch]$OpenBrowser,
  [switch]$ForceCPU
)

<#
  Start ComfyUI + Node server
  - Detects NVIDIA GPU and picks run_nvidia_gpu.bat or run_cpu.bat for ComfyUI Portable
  - Starts ComfyUI, waits for port 8188 to respond
  - Starts Node server (adapter-node build) on -Port (default 3000)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

  $gpu = $false
  try { Get-Command nvidia-smi -ErrorAction SilentlyContinue | Out-Null; $gpu = $true } catch {}

  $bat = $null
  if ($Cpu) {
    if (Test-Path (Join-Path $dir "run_cpu.bat")) { $bat = "run_cpu.bat" }
  } else {
    if ($gpu -and (Test-Path (Join-Path $dir "run_nvidia_gpu.bat"))) {
      $bat = "run_nvidia_gpu.bat"
    } elseif (Test-Path (Join-Path $dir "run_cpu.bat")) {
      $bat = "run_cpu.bat"
    }
  }

  if ($bat) {
    Write-Host "Starting ComfyUI via $bat..." -ForegroundColor DarkCyan
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c $bat"
    $psi.WorkingDirectory = (Resolve-Path $dir)
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    return $p
  }

  # Try source install path using venv Python
  $venvPy = Join-Path (Resolve-Path "vendor") "comfy-venv\\Scripts\\python.exe"
  if (Test-Path $venvPy) {
    Write-Host "Starting ComfyUI via venv python..." -ForegroundColor DarkCyan
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $venvPy
    $extra = if ($Cpu) { " --cpu" } else { "" }
    $psi.Arguments = ("-s main.py --windows-standalone-build" + $extra)
    $psi.WorkingDirectory = (Resolve-Path $dir)
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $p = [System.Diagnostics.Process]::Start($psi)
    return $p
  }

  Write-Host "No portable scripts or venv python found. Run scripts\\bootstrap.ps1 first." -ForegroundColor Yellow
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
  Write-Header "Prerequisite check"
  New-DirectoryIfMissing "vendor"

  # Determine if using a Portable ComfyUI (run_*.bat present)
  $runNvidiaBat = Join-Path $ComfyDir "run_nvidia_gpu.bat"
  $runCpuBat = Join-Path $ComfyDir "run_cpu.bat"
  $usePortable = (Test-Path $runNvidiaBat) -or (Test-Path $runCpuBat)

  $useCpu = $false
  if ($usePortable) {
    if ($ForceCPU) { $useCpu = $true; $env:CUDA_VISIBLE_DEVICES = "-1" }
  } else {
    # Ensure ComfyUI + venv exist; run bootstrap (without building app) if missing
    $venvPy = Join-Path (Resolve-Path "vendor") "comfy-venv\\Scripts\\python.exe"
    if (-not (Test-Path $ComfyDir) -or -not (Test-Path $venvPy)) {
      Write-Header "Setting up ComfyUI (latest source)"
      & pwsh -File "scripts\\bootstrap.ps1" -SkipBuild | Write-Host
    }

    # Ensure CUDA-enabled torch is installed when NVIDIA is present; decide CPU fallback
    $useCpu = $ForceCPU
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

    # Ensure common extras used by custom nodes (e.g., matplotlib for cgem156-ComfyUI)
    if (Test-Path $venvPy) {
      Install-PythonPackages -venvPy $venvPy -packages @('matplotlib')
    }
  }

  Write-Header "Start ComfyUI"
  $comfy = Start-ComfyUI -dir $ComfyDir -Cpu:$useCpu
  if (-not (Wait-For-Port8188)) {
    Write-Host "ComfyUI did not respond on 8188 in time. You may still continue if starting manually." -ForegroundColor Yellow
  }

  Write-Header "Start App Server"
  $app = Start-NodeServer -port $Port

  if ($OpenBrowser) {
    Start-Process "http://127.0.0.1:$Port"
  }

  if ($comfy) {
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

  # Keep foreground process alive while children run
  while ($true) { Start-Sleep -Seconds 3600 }
} finally {
  Pop-Location
}
