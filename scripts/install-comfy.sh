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
HAS_NVIDIA=0

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

if command -v nvidia-smi >/dev/null 2>&1; then
  HAS_NVIDIA=1
fi

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
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$COMFY_DIR"
else
  echo "ComfyUI directory already exists; updating..."
  cd "$COMFY_DIR"
  git pull || echo "Warning: git pull failed, continuing with existing version."
  cd "$REPO_ROOT"
fi

echo "Preparing Python $PY_VERSION environment..."
VENV_PY=""
UV_BIN=""
if command -v uv >/dev/null 2>&1; then
  UV_BIN="$(command -v uv)"
  "$UV_BIN" python install "$PY_VERSION"
  if [[ ! -d "$VENV_DIR" ]]; then
    "$UV_BIN" venv -p "$PY_VERSION" "$VENV_DIR"
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
echo "Installing ComfyUI requirements (pip output below)..."
if [[ -n "$UV_BIN" ]]; then
  UV_ARGS=(pip install -p "$VENV_PY" -r "$COMFY_DIR/requirements.txt")
  if [[ $HAS_NVIDIA -eq 1 && $FORCE_CPU -eq 0 ]]; then
    UV_ARGS+=("--extra-index-url" "https://download.pytorch.org/whl/cu128")
  fi

	  attempt=0
	  max_attempts=2
	  pip_ok=0
	  while [[ $attempt -lt $max_attempts ]]; do
	    attempt=$((attempt + 1))
	    echo "uv pip install attempt #${attempt}..."
	    if "$UV_BIN" "${UV_ARGS[@]}"; then
	      pip_ok=1
	      break
	    fi
	    echo "uv pip attempt #${attempt} failed. Retrying..." >&2
	    sleep 2
	  done
	  if [[ $pip_ok -eq 0 ]]; then
	    echo "uv pip failed after $max_attempts attempts. Falling back to python -m pip..." >&2
	    PIP_ARGS=(-m pip install -v -r "$COMFY_DIR/requirements.txt")
	    if [[ $HAS_NVIDIA -eq 1 && $FORCE_CPU -eq 0 ]]; then
	      PIP_ARGS+=("--extra-index-url" "https://download.pytorch.org/whl/cu128")
    fi
    if ! "$VENV_PY" "${PIP_ARGS[@]}"; then
      exit 1
    fi
  fi
else
  PIP_ARGS=(-m pip install -v -r "$COMFY_DIR/requirements.txt")
  if [[ $HAS_NVIDIA -eq 1 && $FORCE_CPU -eq 0 ]]; then
    PIP_ARGS+=("--extra-index-url" "https://download.pytorch.org/whl/cu128")
  fi
  if ! "$VENV_PY" "${PIP_ARGS[@]}"; then
    exit 1
  fi
fi

echo "Installing PyTorch..."
echo "Uninstalling existing PyTorch packages..."
"$VENV_PY" -m pip uninstall -y torch torchvision torchaudio 2>/dev/null || true

if [[ $HAS_NVIDIA -eq 1 && $FORCE_CPU -eq 0 ]]; then
  if ! "$VENV_PY" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128; then
    echo "Falling back to CPU PyTorch." >&2
    "$VENV_PY" -m pip install torch torchvision torchaudio
  fi
else
  "$VENV_PY" -m pip install torch torchvision torchaudio
fi

echo "Installing helper Python packages..."
if [[ $HAS_NVIDIA -eq 1 && $FORCE_CPU -eq 0 ]]; then
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

# Check if ComfyUI was running
echo "Checking if ComfyUI is running..."
COMFY_PID=$(pgrep -f "python.*main.py.*--disable-auto-launch" || true)
if [[ -n "$COMFY_PID" ]]; then
  echo "ComfyUI is running (PID: $COMFY_PID). Terminating for restart..."
  kill "$COMFY_PID" 2>/dev/null || true
  sleep 2
  echo "COMFYUI_NEEDS_RESTART"
else
  echo "ComfyUI is not currently running."
fi
