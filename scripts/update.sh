#!/usr/bin/env bash
set -euo pipefail

# Simple updater for macOS/Linux.
# Downloads the latest release ZIP of Julian-adv/tag-painter
# and overlays its contents onto the current directory.

OWNER="${OWNER:-Julian-adv}"
REPO="${REPO:-tag-painter}"
TOKEN="${GITHUB_TOKEN:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but not found." >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

API_URL="https://api.github.com/repos/${OWNER}/${REPO}/releases/latest"
HDRS=("-H" "Accept: application/vnd.github+json" "-H" "User-Agent: tag-painter-updater")
if [ -n "$TOKEN" ]; then
  HDRS+=("-H" "Authorization: Bearer ${TOKEN}")
fi

echo "Fetching latest release info from $API_URL"
JSON_FILE="$TMPDIR/release.json"
curl -sSL "${HDRS[@]}" "$API_URL" -o "$JSON_FILE"

DOWNLOAD_URL=""
if command -v jq >/dev/null 2>&1; then
  # Prefer the first .zip asset; fallback to zipball_url
  DOWNLOAD_URL="$(jq -r '[.assets[]?.browser_download_url | select(endswith(".zip")), .zipball_url] | map(select(. != null)) | .[0] // ""' < "$JSON_FILE")"
else
  # Use Python if available to parse the JSON
  if command -v python3 >/dev/null 2>&1; then
    DOWNLOAD_URL="$(python3 - <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
url = None
assets = data.get('assets', []) or []
for a in assets:
    u = a.get('browser_download_url')
    if isinstance(u,str) and u.endswith('.zip'):
        url = u
        break
if not url:
    url = data.get('zipball_url') or ''
print(url)
PY
"$JSON_FILE")"
  elif command -v python >/dev/null 2>&1; then
    DOWNLOAD_URL="$(python - <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
url = None
assets = data.get('assets', []) or []
for a in assets:
    u = a.get('browser_download_url')
    if isinstance(u,str) and u.endswith('.zip'):
        url = u
        break
if not url:
    url = data.get('zipball_url') or ''
print(url)
PY
"$JSON_FILE")"
  else
    # Very rough fallback: try to grep a .zip asset; else zipball_url
    DOWNLOAD_URL="$(sed -n 's/.*"browser_download_url" *: *"\([^"]*\.zip\)".*/\1/p' "$JSON_FILE" | head -n1)"
    if [ -z "$DOWNLOAD_URL" ]; then
      DOWNLOAD_URL="$(sed -n 's/.*"zipball_url" *: *"\([^"]*\)".*/\1/p' "$JSON_FILE" | head -n1)"
    fi
  fi
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Failed to determine ZIP download URL from latest release." >&2
  exit 1
fi

echo "Downloading: $DOWNLOAD_URL"
ZIP_PATH="$TMPDIR/release.zip"
curl -fL "${HDRS[@]}" -o "$ZIP_PATH" "$DOWNLOAD_URL"

EXTRACT_DIR="$TMPDIR/extracted"
mkdir -p "$EXTRACT_DIR"
echo "Extracting to: $EXTRACT_DIR"
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
else
  # Many macOS systems have bsdtar which can extract zips via tar -xf
  tar -xf "$ZIP_PATH" -C "$EXTRACT_DIR"
fi

# Determine the actual root inside the extracted archive (GitHub zips usually have one top folder)
# Prefer a nested tag-painter/ folder if present, else first directory
if [ -d "$EXTRACT_DIR/tag-painter" ]; then
  SRC_ROOT="$EXTRACT_DIR/tag-painter"
else
  SRC_ROOT="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -n1)"
fi
if [ -z "$SRC_ROOT" ]; then
  SRC_ROOT="$EXTRACT_DIR"
fi

DEST_DIR="$(pwd)"
if [ -d "tag-painter" ]; then
  echo "Detected release layout. Updating: $(pwd)/tag-painter"
  DEST_DIR="$(pwd)/tag-painter"
else
  echo "Updating current directory: $(pwd)"
fi

# Prefer rsync for robust copy including dotfiles; exclude updater scripts
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude='.git' \
    --exclude='update.sh' \
    --exclude='update.ps1' \
    --exclude='start.ps1' \
    --exclude='start.sh' \
    "$SRC_ROOT"/ "$DEST_DIR"/
else
  # Fallback: copy including dotfiles; exclude updater scripts manually
  shopt -s dotglob nullglob
  for path in "$SRC_ROOT"/* "$SRC_ROOT"/.*; do
    base="$(basename "$path")"
    [ "$base" = "." ] && continue
    [ "$base" = ".." ] && continue
    [ "$base" = "update.sh" ] && continue
    [ "$base" = "update.ps1" ] && continue
    [ "$base" = "start.ps1" ] && continue
    [ "$base" = "start.sh" ] && continue
    [ "$base" = ".git" ] && continue
    cp -R "$path" "$DEST_DIR/$base"
  done
  shopt -u dotglob nullglob
fi

echo "Update complete."
