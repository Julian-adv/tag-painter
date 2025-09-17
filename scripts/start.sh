#!/usr/bin/env bash
set -euo pipefail

# Start ComfyUI + Node server (macOS/Linux)

PORT="${PORT:-3000}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor"
COMFY_DIR="$VENDOR_DIR/ComfyUI"
VENV_DIR="$VENDOR_DIR/comfy-venv"

echo "=== Start (macOS/Linux) ==="

NEEDS_BOOTSTRAP=0
if [[ ! -d "$COMFY_DIR" || ! -d "$VENV_DIR" ]]; then
  NEEDS_BOOTSTRAP=1
elif [[ ! -f "$VENV_DIR/bin/activate" ]]; then
  NEEDS_BOOTSTRAP=1
fi

if [[ $NEEDS_BOOTSTRAP -eq 1 ]]; then
  echo "Running bootstrap (macOS/Linux) for ComfyUI/venv ..."
  bash "$REPO_ROOT/scripts/bootstrap.sh"
fi

source "$VENV_DIR/bin/activate"

echo "Starting ComfyUI..."
(cd "$COMFY_DIR" && python main.py --listen 0.0.0.0 --port 8188 --disable-auto-launch --enable-cors-header '*') &
COMFY_PID=$!

WAIT_URL="http://127.0.0.1:8188/"
PROBE_TOOL=""
if command -v curl >/dev/null 2>&1; then
  PROBE_TOOL="curl"
elif command -v wget >/dev/null 2>&1; then
  PROBE_TOOL="wget"
elif command -v python3 >/dev/null 2>&1; then
  PROBE_TOOL="python3"
fi

if [[ -n "$PROBE_TOOL" ]]; then
  echo "Waiting for ComfyUI on $WAIT_URL ..."
  for i in {1..90}; do
    if [[ "$PROBE_TOOL" == "curl" ]]; then
      if curl -sSf "$WAIT_URL" >/dev/null; then
        break
      fi
    elif [[ "$PROBE_TOOL" == "wget" ]]; then
      if wget -qO- "$WAIT_URL" >/dev/null; then
        break
      fi
    else
      if python3 - "$WAIT_URL" <<'PY'
import sys
import urllib.request

urllib.request.urlopen(sys.argv[1], timeout=2)
PY
      then
        break
      fi
    fi
    sleep 2
  done
else
  echo "Warning: curl, wget, or python3 not found; skipping ComfyUI readiness check." >&2
  sleep 5
fi

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
