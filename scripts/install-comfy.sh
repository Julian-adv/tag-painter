#!/usr/bin/env bash
set -euo pipefail

# Installs or reinstalls the local ComfyUI environment for Tag Painter (macOS/Linux).
# - Clones the latest ComfyUI release into vendor/ComfyUI
# - Creates a Python 3.12 virtual environment (prefers uv if available)
# - Installs ComfyUI requirements, PyTorch (CUDA when NVIDIA is available), and extras

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}" )/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor"
COMFY_DIR="$VENDOR_DIR/ComfyUI"
VENV_DIR="$VENDOR_DIR/comfy-venv"
PY_VERSION="3.12"
REINSTALL=0
FORCE_CPU=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reinstall)
      REINSTALL=1
      ;;
    --force-cpu)
      FORCE_CPU=1
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/install-comfy.sh [--reinstall] [--force-cpu]

Installs the ComfyUI runtime used by Tag Painter under vendor/ComfyUI.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

echo "=== Install ComfyUI (macOS/Linux) ==="

mkdir -p "$VENDOR_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required to install ComfyUI." >&2
  exit 1
fi

backup_dir=""
if [[ $REINSTALL -eq 1 && -d "$COMFY_DIR" ]]; then
  echo "Backing up existing models directory..."
  if [[ -d "$COMFY_DIR/models" ]]; then
    backup_dir="$(mktemp -d)"
    mv "$COMFY_DIR/models" "$backup_dir/models"
  fi
  rm -rf "$COMFY_DIR" "$VENV_DIR"
fi

if [[ ! -d "$COMFY_DIR" ]]; then
  echo "Cloning ComfyUI..."
  latest_tag=""
  if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    latest_tag="$(curl -fsSL https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest | jq -r '.tag_name // empty' || true)"
  fi
  if [[ -n "$latest_tag" && "$latest_tag" != "null" ]]; then
    git clone --depth 1 --branch "$latest_tag" https://github.com/comfyanonymous/ComfyUI.git "$COMFY_DIR"
  else
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$COMFY_DIR"
  fi
else
  echo "ComfyUI directory already exists; skipping clone."
fi

echo "Preparing Python $PY_VERSION environment..."
VENV_PY=""
if command -v uv >/dev/null 2>&1; then
  uv python install "$PY_VERSION"
  if [[ ! -d "$VENV_DIR" ]]; then
    uv venv -p "$PY_VERSION" "$VENV_DIR"
  fi
  VENV_PY="$VENV_DIR/bin/python"
else
  PYTHON_BIN="python3"
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    PYTHON_BIN="python"
  fi
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Error: python3 is required. Install Python $PY_VERSION or uv." >&2
    exit 1
  fi
  if [[ ! -d "$VENV_DIR" ]]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
  VENV_PY="$VENV_DIR/bin/python"
fi

"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r "$COMFY_DIR/requirements.txt"

echo "Installing PyTorch..."
if command -v nvidia-smi >/dev/null 2>&1 && [[ $FORCE_CPU -eq 0 ]]; then
  if ! "$VENV_PY" -m pip install --upgrade --force-reinstall --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121; then
    echo "Falling back to CPU PyTorch." >&2
    "$VENV_PY" -m pip install --upgrade torch torchvision torchaudio
  fi
else
  "$VENV_PY" -m pip install --upgrade torch torchvision torchaudio
fi

echo "Installing helper Python packages..."
if command -v nvidia-smi >/dev/null 2>&1 && [[ $FORCE_CPU -eq 0 ]]; then
  "$VENV_PY" -m pip install --upgrade onnxruntime-gpu || "$VENV_PY" -m pip install --upgrade onnxruntime
else
  "$VENV_PY" -m pip install --upgrade onnxruntime
fi
"$VENV_PY" -m pip install --upgrade matplotlib pandas

if [[ -n "$backup_dir" && -d "$backup_dir/models" ]]; then
  echo "Restoring models directory..."
  rm -rf "$COMFY_DIR/models"
  mv "$backup_dir/models" "$COMFY_DIR/models"
  rm -rf "$backup_dir"
fi

echo "ComfyUI installation completed."
