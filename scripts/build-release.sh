#!/usr/bin/env bash
set -euo pipefail

OUT_FILE="tag-painter-release.zip"
NO_BUILD=0

usage() {
  echo "Usage: $(basename "$0") [--out-file <zip>] [--no-build]" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-file)
      [[ $# -ge 2 ]] || usage
      OUT_FILE="$2"
      shift 2
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      usage
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ "$OUT_FILE" == "tag-painter-release.zip" ]]; then
  VERSION=""
  if command -v node >/dev/null 2>&1; then
    VERSION="$(node -e 'try { const pkg = require("./package.json"); console.log(pkg.version || ""); } catch (_) { process.exit(0); }' 2>/dev/null || true)"
  fi
  if [[ -n "$VERSION" ]]; then
    OUT_FILE="tag-painter-release-v${VERSION}.zip"
  else
    echo "Warning: could not read version from package.json; using default name." >&2
  fi

if [[ $NO_BUILD -eq 0 ]]; then
  echo "Building app..."
  if command -v pwsh >/dev/null 2>&1; then
    pwsh -File "$SCRIPT_DIR/build.ps1"
  else
    if ! npm ci; then
      npm install
    fi
    npm run build
  fi
  if [[ ! -f "build/index.js" ]]; then
    echo "Build output missing (build/index.js). Aborting packaging." >&2
    exit 1
  fi
else
  echo "Skipping build (--no-build)."
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip command is required to build the release archive." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

ROOT_FOLDER_NAME="tag-painter"
PAYLOAD_ROOT="$TMP_DIR/$ROOT_FOLDER_NAME"
mkdir -p "$PAYLOAD_ROOT"

copy_paths=(
  "package.json"
  "package-lock.json"
  "svelte.config.js"
  "vite.config.ts"
  "tsconfig.json"
  "README.md"
  "LICENSE"
  "project.inlang"
  "messages"
  "danbooru_tags.txt"
  "config"
  "src"
  "static"
  "docs"
  "scripts"
  "build"
)

use_rsync=0
if command -v rsync >/dev/null 2>&1; then
  use_rsync=1
fi

for path in "${copy_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    continue
  fi
  if [[ $use_rsync -eq 1 ]]; then
    if [[ "$path" == "project.inlang" ]]; then
      rsync -a --exclude 'cache' "$path" "$PAYLOAD_ROOT/"
    else
      rsync -a "$path" "$PAYLOAD_ROOT/"
    fi
  else
    if [[ -d "$path" ]]; then
      cp -R "$path" "$PAYLOAD_ROOT/"
      if [[ "$path" == "project.inlang" ]]; then
        rm -rf "$PAYLOAD_ROOT/project.inlang/cache" 2>/dev/null || true
      fi
    else
      cp "$path" "$PAYLOAD_ROOT/"
    fi
  fi
done

DATA_DIR="$PAYLOAD_ROOT/data"
mkdir -p "$DATA_DIR"
data_files=(
  "prompts.json"
  "settings.json"
  "wildcards.yaml"
  "wildcards.qwen.yaml"
  "Vision2.1.yaml"
  "outfits.txt"
  "lights.txt"
)
for data_file in "${data_files[@]}"; do
  src_path="data/$data_file"
  if [[ -f "$src_path" ]]; then
    cp "$src_path" "$DATA_DIR/"
  fi
done

data_dirs=(
  "wildcards"
  "examples"
  "workflow"
)
for data_dir in "${data_dirs[@]}"; do
  src_dir="data/$data_dir"
  if [[ -d "$src_dir" ]]; then
    if [[ $use_rsync -eq 1 ]]; then
      rsync -a "$src_dir/" "$DATA_DIR/$data_dir/"
    else
      mkdir -p "$DATA_DIR/$data_dir"
      cp -R "$src_dir/." "$DATA_DIR/$data_dir/"
    fi
  fi
done

SETTINGS_PATH="$DATA_DIR/settings.json"
if [[ -f "$SETTINGS_PATH" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is required to process settings.json for release. Please install Node.js." >&2
    exit 1
  fi
  if node - "$SETTINGS_PATH" <<'NODE'; then
const fs = require('fs');
const path = process.argv[2];
if (!path) {
  process.exit(0);
}
try {
  const raw = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  data.outputDirectory = '';
  data.comfyUrl = 'http://127.0.0.1:8188';
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
NODE
      echo "Release settings.json: comfyUrl and outputDirectory reset"
    else
      echo "Warning: failed to process settings.json for release." >&2
    fi
  else
    echo "Warning: failed to process settings.json for release." >&2
  fi
fi

WRAPPER_BAT="release/start.bat"
WRAPPER_SH="release/start.sh"
[[ -f "$WRAPPER_BAT" ]] && cp "$WRAPPER_BAT" "$TMP_DIR/start.bat"
[[ -f "$WRAPPER_SH" ]] && cp "$WRAPPER_SH" "$TMP_DIR/start.sh"

UPDATER_BAT="release/update.bat"
UPDATER_SH="scripts/update.sh"
[[ -f "$UPDATER_BAT" ]] && cp "$UPDATER_BAT" "$TMP_DIR/update.bat"
[[ -f "$UPDATER_SH" ]] && cp "$UPDATER_SH" "$TMP_DIR/update.sh"

OUT_PATH="$OUT_FILE"
if [[ "$OUT_PATH" != /* ]]; then
  OUT_PATH="$REPO_ROOT/$OUT_PATH"
fi

rm -f "$OUT_PATH"

(
  cd "$TMP_DIR"
  zip -rq "$OUT_PATH" .
)

echo "Release created: $OUT_PATH"
