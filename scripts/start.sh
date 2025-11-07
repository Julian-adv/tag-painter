#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
OPEN_BROWSER=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --open-browser)
      OPEN_BROWSER=1
      ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/start.sh [--open-browser]

Starts the Tag Painter web server. ComfyUI should be managed via the in-app setup dialog.
HELP
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}" )/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -d node_modules ]]; then
  echo "Installing Node dependencies (npm ci)..."
  npm ci
fi

if [[ ! -f build/index.js ]]; then
  echo "Missing build output. Run 'npm run build' first." >&2
  exit 1
fi

echo "Starting Tag Painter on http://127.0.0.1:$PORT ..."
PORT="$PORT" NODE_ENV=production node build/index.js &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
if [[ $OPEN_BROWSER -eq 1 ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:$PORT" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:$PORT"
  fi
fi

trap 'kill $SERVER_PID >/dev/null 2>&1 || true' INT TERM
wait $SERVER_PID
