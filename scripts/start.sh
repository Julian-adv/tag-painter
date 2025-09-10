#!/usr/bin/env bash
set -euo pipefail

# Start ComfyUI + Node server (macOS/Linux)

PORT="${PORT:-3000}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor"
COMFY_DIR="$VENDOR_DIR/ComfyUI"
VENV_DIR="$VENDOR_DIR/comfy-venv"

echo "=== Start (macOS/Linux) ==="

if [[ ! -d "$COMFY_DIR" || ! -d "$VENV_DIR" ]]; then
  echo "Running bootstrap (macOS/Linux) for ComfyUI/venv ..."
  bash "$REPO_ROOT/scripts/bootstrap.sh"
fi

source "$VENV_DIR/bin/activate"

echo "Starting ComfyUI..."
(cd "$COMFY_DIR" && python main.py) > "$VENDOR_DIR/comfyui.log" 2>&1 &
COMFY_PID=$!

echo "Waiting for ComfyUI on http://127.0.0.1:8188 ..."
for i in {1..90}; do
  if curl -sSf "http://127.0.0.1:8188/" >/dev/null; then
    break
  fi
  sleep 2
done

if [[ ! -f "$REPO_ROOT/build/index.js" ]]; then
  echo "Missing build output. Please build the app first (npm run build) or use a release ZIP including build/." >&2
  exit 1
fi

echo "Starting Node server on http://127.0.0.1:$PORT ..."
cd "$REPO_ROOT"
node build/index.js > "$VENDOR_DIR/app.log" 2>&1 &
APP_PID=$!

echo "ComfyUI PID: $COMFY_PID"
echo "App PID: $APP_PID"
echo "Press Ctrl+C to exit (this won't stop background processes)."
wait
