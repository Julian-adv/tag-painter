#!/usr/bin/env bash
set -euo pipefail

# Wrapper that forwards all args to the inner script under tag-painter/scripts/start.sh
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INNER="$DIR/tag-painter/scripts/start.sh"
if [[ ! -f "$INNER" ]]; then
  echo "Inner start script not found: $INNER" >&2
  exit 1
fi

exec bash "$INNER" "$@"
