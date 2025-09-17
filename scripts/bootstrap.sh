#!/usr/bin/env bash
set -euo pipefail

# macOS/Linux bootstrap script
# - Verifies Node v22.19.0 (warns if different)
# - Installs JS deps and builds the app with adapter-node
# - Sets up ComfyUI under vendor/ComfyUI via git + Python venv
# - Installs custom node cgem156-ComfyUI

NODE_REQUIRED="v22.19.0"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor"
COMFY_DIR="$VENDOR_DIR/ComfyUI"
VENV_DIR="$VENDOR_DIR/comfy-venv"
CUSTOM_NODE_REPO="https://github.com/laksjdjf/cgem156-ComfyUI"
CUSTOM_NODE_BRANCH="main"
PY_REQ_MAJOR=3
PY_REQ_MINOR=13

echo "=== Bootstrap (macOS/Linux) ==="

mkdir -p "$VENDOR_DIR"

echo "Checking Node version..."
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v)"
  if [[ "$NODE_VER" != "$NODE_REQUIRED" ]]; then
    echo "Warning: Node $NODE_REQUIRED is recommended, found $NODE_VER" >&2
  fi
else
  echo "Error: node is not installed. Please install Node $NODE_REQUIRED and re-run." >&2
  exit 1
fi

echo "Installing JS dependencies..."
cd "$REPO_ROOT"
npm ci

echo "Building app (adapter-node)..."
npm run build

echo "Setting up ComfyUI (git clone + venv)..."
if [[ ! -d "$COMFY_DIR" ]]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "Error: git is required to fetch ComfyUI on macOS/Linux." >&2
    exit 1
  fi
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "$COMFY_DIR"
fi

echo "Preparing Python 3.${PY_REQ_MINOR} venv (prefers uv)..."
if command -v uv >/dev/null 2>&1; then
  uv python install "${PY_REQ_MAJOR}.${PY_REQ_MINOR}"
  if [[ ! -d "$VENV_DIR" ]]; then
    uv venv -p "${PY_REQ_MAJOR}.${PY_REQ_MINOR}" "$VENV_DIR"
  fi
  VENV_PY="$VENV_DIR/bin/python"
else
  PYTHON_BIN="python3"
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    PYTHON_BIN="python"
  fi
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Error: Python ${PY_REQ_MAJOR}.${PY_REQ_MINOR} is recommended. Install uv or Python ${PY_REQ_MAJOR}.${PY_REQ_MINOR}." >&2
    exit 1
  fi
  # Check version
  PY_VER=$($PYTHON_BIN -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")')
  if [[ "$PY_VER" != "${PY_REQ_MAJOR}.${PY_REQ_MINOR}" ]]; then
    echo "Warning: Python ${PY_REQ_MAJOR}.${PY_REQ_MINOR} recommended, found $PY_VER" >&2
  fi
  if [[ ! -d "$VENV_DIR" ]]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
  VENV_PY="$VENV_DIR/bin/python"
fi

"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r "$COMFY_DIR/requirements.txt"

echo "Installing torch (auto-detect NVIDIA)..."
if command -v nvidia-smi >/dev/null 2>&1; then
  "$VENV_PY" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
else
  "$VENV_PY" -m pip install torch torchvision torchaudio
fi

echo "Installing additional Python dependencies..."
"$VENV_PY" -m pip install matplotlib

echo "Installing custom node: cgem156-ComfyUI"
CUSTOM_NODE_DIR="$COMFY_DIR/custom_nodes/cgem156-ComfyUI"
mkdir -p "$COMFY_DIR/custom_nodes"
if [[ ! -d "$CUSTOM_NODE_DIR" ]]; then
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$CUSTOM_NODE_BRANCH" "$CUSTOM_NODE_REPO" "$CUSTOM_NODE_DIR"
  else
    TMPDIR="$(mktemp -d)"
    curl -L "$CUSTOM_NODE_REPO/archive/refs/heads/$CUSTOM_NODE_BRANCH.zip" -o "$TMPDIR/cgem156.zip"
    unzip -q "$TMPDIR/cgem156.zip" -d "$TMPDIR"
    mv "$TMPDIR"/cgem156-ComfyUI-* "$CUSTOM_NODE_DIR"
    rm -rf "$TMPDIR"
  fi
fi

echo "Done. Use scripts/start.sh to run ComfyUI + app server."
