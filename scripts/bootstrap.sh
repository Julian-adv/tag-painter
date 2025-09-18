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
CUSTOM_SCRIPTS_REPO="https://github.com/pythongosssss/ComfyUI-Custom-Scripts"
CUSTOM_SCRIPTS_BRANCH="main"
IMPACT_PACK_REPO="https://github.com/ltdrdata/ComfyUI-Impact-Pack"
IMPACT_PACK_BRANCH="Main"
IMPACT_SUBPACK_REPO="https://github.com/ltdrdata/ComfyUI-Impact-Subpack"
IMPACT_SUBPACK_BRANCH="main"
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
  GPU_CAP_RAW=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -n1 | tr -d ' ')
  if [[ "$GPU_CAP_RAW" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    GPU_CAP_MAJOR="${BASH_REMATCH[1]}"
    # Compute capability 12.x corresponds to sm120 (RTX 50-series).
    if (( GPU_CAP_MAJOR >= 12 )); then
      echo "Detected compute capability $GPU_CAP_RAW; installing PyTorch nightly (CUDA 12.9) for RTX 50-series."
      "$VENV_PY" -m pip install --pre --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu129
    else
      echo "Detected compute capability $GPU_CAP_RAW; installing CUDA 12.1 PyTorch wheels."
      "$VENV_PY" -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    fi
  else
    echo "Warning: could not parse compute capability from nvidia-smi; installing CUDA 12.1 PyTorch wheels." >&2
    "$VENV_PY" -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
  fi
else
  "$VENV_PY" -m pip install --upgrade torch torchvision torchaudio
fi

install_node_requirements() {
  local node_dir="$1"
  local requirements_file="$node_dir/requirements.txt"
  if [[ -f "$requirements_file" ]]; then
    echo "Installing dependencies for $(basename "$node_dir")..."
    "$VENV_PY" -m pip install -r "$requirements_file"
  fi
}

install_custom_node() {
  local repo_url="$1"
  local dest_dir="$2"
  local branch="$3"

  if [[ -d "$dest_dir" ]]; then
    echo "Custom node already present: $dest_dir"
    install_node_requirements "$dest_dir"
    return
  fi

  mkdir -p "$(dirname "$dest_dir")"

  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$branch" "$repo_url" "$dest_dir"
  else
    if ! command -v curl >/dev/null 2>&1; then
      echo "Error: git or curl required to install custom nodes." >&2
      exit 1
    fi
    TMPDIR="$(mktemp -d)"
    ARCHIVE="$TMPDIR/custom_node.zip"
    curl -L "$repo_url/archive/refs/heads/$branch.zip" -o "$ARCHIVE"
    unzip -q "$ARCHIVE" -d "$TMPDIR"
    local extracted
    extracted="$(find "$TMPDIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    if [[ -z "$extracted" ]]; then
      echo "Error: failed to extract custom node from archive." >&2
      exit 1
    fi
    mv "$extracted" "$dest_dir"
    rm -rf "$TMPDIR"
  fi

  install_node_requirements "$dest_dir"
}

echo "Installing custom nodes..."
install_custom_node "$CUSTOM_NODE_REPO" "$COMFY_DIR/custom_nodes/cgem156-ComfyUI" "$CUSTOM_NODE_BRANCH"
install_custom_node "$CUSTOM_SCRIPTS_REPO" "$COMFY_DIR/custom_nodes/ComfyUI-Custom-Scripts" "$CUSTOM_SCRIPTS_BRANCH"
install_custom_node "$IMPACT_PACK_REPO" "$COMFY_DIR/custom_nodes/ComfyUI-Impact-Pack" "$IMPACT_PACK_BRANCH"
install_custom_node "$IMPACT_SUBPACK_REPO" "$COMFY_DIR/custom_nodes/ComfyUI-Impact-Subpack" "$IMPACT_SUBPACK_BRANCH"

echo "Done. Use scripts/start.sh to run ComfyUI + app server."
