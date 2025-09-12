Deployment Guide

Overview

- Targets Windows first; macOS/Linux supported with shell scripts.
- Online install only. Downloads Node and ComfyUI (or clones) at first run.
- Python 3.13 default (Windows) via uv; macOS/Linux prefers uv, falls back to system Python.
- GPU selection delegated to ComfyUI; scripts auto-pick NVIDIA where possible.
- Models/LoRA are not bundled. Use ComfyUI UI (Manager included) to download on first run.

Prerequisites

- Internet connectivity
- Windows PowerShell 5+ (Windows 10/11) or bash (macOS/Linux)
- Optional: git (recommended on macOS/Linux)

Build Adapter

- Uses `@sveltejs/adapter-node` and runs on port `3000` by default.

Windows (single entry)

1. Start
   - pwsh -File scripts/start.ps1

   Behavior:
   - If ComfyUI is missing, it downloads latest source ZIP, creates Python 3.13 venv and installs requirements/Torch.
   - It does not build the app automatically.
   - If ComfyUI is missing, it downloads and installs the latest release source ZIP (no 7-Zip/Git required).
     - Optional: set `COMFY_PORTABLE_URL` to use a Windows portable archive instead.
   - Installs Python 3.13 venv via uv, requirements, and Torch (NVIDIA if available).
   - Installs custom node `cgem156-ComfyUI` automatically.
   - Picks `run_nvidia_gpu.bat` when NVIDIA GPU is detected; otherwise `run_cpu.bat`.
   - Waits for ComfyUI (8188) then starts the app server (3000 by default).
   - Optional flags: `-Port 3000`, `-OpenBrowser` (both optional).

macOS/Linux (single entry)

1. Start
   - PORT=3000 bash scripts/start.sh

   Behavior:
   - If prerequisites are missing, it runs `scripts/bootstrap.sh` automatically.
   - Uses Python 3.13 venv under `vendor/comfy-venv` to run ComfyUI (uv preferred; otherwise system Python).
   - Installs Torch with CUDA when `nvidia-smi` is available; otherwise CPU.
   - Installs custom node `cgem156-ComfyUI`.

Building & Packaging (maintainers)

- Build only:
  - Windows: `pwsh -File scripts/build.ps1` (installs Node 22.19 portable if needed)
  - macOS/Linux: `npm ci && npm run build`
- Build + Zip package:
  - `npm run release` (runs build first, then creates ZIP at `tag-painter-release.zip`)
  - Skip build: `pwsh -File scripts/build-release.ps1 -NoBuild`

Release ZIP layout

- After extracting `tag-painter-release.zip`, the top-level contains only the start scripts and a single folder:
  - `start.ps1` (Windows)
  - `start.sh` (macOS/Linux)
  - `tag-painter/` (all app files live here)

Usage (from extracted ZIP)

- Windows: `pwsh -File ./start.ps1 [-Port 3000]`
- macOS/Linux: `bash ./start.sh`
- Notes:
  - The wrapper scripts forward all arguments to `tag-painter/scripts/start.*`.
  - For development clones, you can continue to use `scripts/start.ps1` or `scripts/start.sh` directly.
  - Windows: `scripts/start.ps1` streams ComfyUI and app logs to the console.
  - CUDA GPUs: the Windows start script auto-checks CUDA support and will attempt multiple CUDA wheel indexes (cu126, cu124, cu121). If unavailable, it falls back to CPU to avoid crashes. Use `-ForceCPU` to bypass GPU.
  - Existing ComfyUI Portable: pass `-ComfyDir "D:\ComfyUI_windows_portable"` to use your installed portable (uses its `run_*.bat` and skips our venv).

Custom Nodes

- `cgem156-ComfyUI` is installed automatically during bootstrap.
- To add more, place them under `vendor/ComfyUI/custom_nodes`.

Updating

- App: pull changes, run `npm ci && npm run build`.
- ComfyUI (Windows portable): replace the portable folder inside `vendor/ComfyUI`.
- ComfyUI (macOS/Linux): `cd vendor/ComfyUI && git pull` then reinstall requirements if needed.

Troubleshooting

- Port 8188 Busy: Ensure no existing ComfyUI instance is running.
- Node Mismatch: Scripts prefer system Node if it exactly matches v22.19.0; otherwise a portable Node is installed to `vendor/node`.
- Missing Portable URL (Windows): Rerun bootstrap with `-ComfyPortableUrl` or manually place ComfyUI under `vendor/ComfyUI`.
