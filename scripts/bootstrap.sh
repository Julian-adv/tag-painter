#!/usr/bin/env bash
set -euo pipefail

NODE_REQUIRED="v24.11.1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}" )/.." && pwd)"

echo "=== Bootstrap (macOS/Linux) ==="

if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v)"
  if [[ "$NODE_VER" != "$NODE_REQUIRED" ]]; then
    echo "Warning: Node $NODE_REQUIRED is recommended, found $NODE_VER" >&2
  fi
else
  echo "Error: node is not installed. Please install Node $NODE_REQUIRED and re-run." >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "Installing JS dependencies..."
npm ci

echo "Building app (adapter-node)..."
npm run build

echo "ComfyUI installation is now handled via scripts/install-comfy.sh (or the in-app setup dialog)."
echo "Run that installer separately if you need to prepare the ComfyUI runtime."
