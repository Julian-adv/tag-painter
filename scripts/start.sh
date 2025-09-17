#!/usr/bin/env bash
set -euo pipefail

# Start ComfyUI + Node server (macOS/Linux)

PORT="${PORT:-3000}"
REINSTALL_COMFY=0
MODELS_BACKUP_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reinstall-comfy)
      REINSTALL_COMFY=1
      ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--reinstall-comfy]" >&2
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $(basename "$0") [--reinstall-comfy]" >&2
      exit 1
      ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor"
COMFY_DIR="$VENDOR_DIR/ComfyUI"
VENV_DIR="$VENDOR_DIR/comfy-venv"

ensure_download_tool() {
  if command -v curl >/dev/null 2>&1; then
    echo curl
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    echo wget
    return
  fi
  echo "" >&2
}

download_model_if_missing() {
  local url="$1"
  local dest="$2"
  local label="$3"

  if [[ -f "$dest" && -s "$dest" ]]; then
    return
  fi

  local tool
  tool=$(ensure_download_tool)
  if [[ -z "$tool" ]]; then
    echo "Error: neither curl nor wget is available to download $label." >&2
    exit 1
  fi

  echo "Downloading $label..."
  mkdir -p "$(dirname "$dest")"
  local tmp
  tmp="$(mktemp)"

  if [[ "$tool" == "curl" ]]; then
    if ! curl -L --fail --silent --show-error "$url" -o "$tmp"; then
      rm -f "$tmp"
      echo "Error: failed to download $label from $url" >&2
      exit 1
    fi
  else
    if ! wget -q "$url" -O "$tmp"; then
      rm -f "$tmp"
      echo "Error: failed to download $label from $url" >&2
      exit 1
    fi
  fi

  local size
  size=$(wc -c < "$tmp" 2>/dev/null || echo 0)
  if [[ "$size" -lt 102400 ]]; then
    rm -f "$tmp"
    echo "Error: downloaded file for $label looks too small ($size bytes)." >&2
    exit 1
  fi

  mv "$tmp" "$dest"
}

ensure_required_models() {
  if [[ ! -d "$COMFY_DIR" ]]; then
    return
  fi

  download_model_if_missing \
    "https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8m-seg.pt" \
    "$COMFY_DIR/models/ultralytics/segm/person_yolov8m-seg.pt" \
    "Ultralytics person segmentation model"

  download_model_if_missing \
    "https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt" \
    "$COMFY_DIR/models/ultralytics/bbox/face_yolov8m.pt" \
    "Ultralytics face detection model"

  download_model_if_missing \
    "https://huggingface.co/moonshotmillion/VAEfixFP16ErrorsSDXLLowerMemoryUse_v10/resolve/main/fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors" \
    "$COMFY_DIR/models/vae/fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors" \
    "VAE model"

  download_model_if_missing \
    "https://huggingface.co/NeigeSnowflake/neigeworkflow/resolve/main/MoriiMee_Gothic_Niji_Style_Illustrious_r1.safetensors" \
    "$COMFY_DIR/models/loras/MoriiMee_Gothic_Niji_Style_Illustrious_r1.safetensors" \
    "LoRA MoriiMee_Gothic_Niji_Style_Illustrious_r1"

  download_model_if_missing \
    "https://civitai.com/api/download/models/567119" \
    "$COMFY_DIR/models/loras/spo_sdxl_10ep_4k-data_lora_webui.safetensors" \
    "LoRA spo_sdxl_10ep_4k-data_lora_webui"

  download_model_if_missing \
    "https://civitai.com/api/download/models/481798" \
    "$COMFY_DIR/models/loras/Sinozick_Style_XL_Pony.safetensors" \
    "LoRA Sinozick_Style_XL_Pony"

  download_model_if_missing \
    "https://huggingface.co/LyliaEngine/Fant5yP0ny/resolve/main/Fant5yP0ny.safetensors?download=true" \
    "$COMFY_DIR/models/loras/Fant5yP0ny.safetensors" \
    "LoRA Fant5yP0ny"

  download_model_if_missing \
    "https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/sams/sam_vit_b_01ec64.pth" \
    "$COMFY_DIR/models/sams/sam_vit_b_01ec64.pth" \
    "SAM model"

  download_model_if_missing \
    "https://huggingface.co/FacehugmanIII/4x_foolhardy_Remacri/resolve/main/4x_foolhardy_Remacri.pth?download=true" \
    "$COMFY_DIR/models/upscale_models/4x_foolhardy_Remacri.pt" \
    "Upscale model 4x_foolhardy_Remacri"
}

echo "=== Start (macOS/Linux) ==="

if [[ $REINSTALL_COMFY -eq 1 ]]; then
  echo "Removing existing ComfyUI environment..."
  if [[ -d "$COMFY_DIR/models" ]]; then
    MODELS_BACKUP_DIR="$(mktemp -d)"
    mv "$COMFY_DIR/models" "$MODELS_BACKUP_DIR/models"
  fi
  rm -rf "$COMFY_DIR" "$VENV_DIR"
fi

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

if [[ -n "$MODELS_BACKUP_DIR" && -d "$MODELS_BACKUP_DIR/models" ]]; then
  if [[ -d "$COMFY_DIR" ]]; then
    if [[ -d "$COMFY_DIR/models" ]]; then
      if command -v rsync >/dev/null 2>&1; then
        rsync -a --ignore-existing "$COMFY_DIR/models/" "$MODELS_BACKUP_DIR/models/"
      else
        while IFS= read -r -d '' item; do
          name="$(basename "$item")"
          dest="$MODELS_BACKUP_DIR/models/$name"
          if [[ ! -e "$dest" ]]; then
            cp -a "$item" "$dest"
          fi
        done < <(find "$COMFY_DIR/models" -mindepth 1 -maxdepth 1 -print0)
      fi
      rm -rf "$COMFY_DIR/models"
    fi
    mv "$MODELS_BACKUP_DIR/models" "$COMFY_DIR/models"
    echo "Restored models directory to $COMFY_DIR/models"
    rm -rf "$MODELS_BACKUP_DIR"
  else
    echo "Warning: ComfyUI directory missing after bootstrap; models kept at $MODELS_BACKUP_DIR" >&2
  fi
fi

ensure_required_models

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

export PORT
if [[ -z "${BODY_SIZE_LIMIT:-}" ]]; then
  export BODY_SIZE_LIMIT=52428800
fi
if [[ -z "${NODE_ENV:-}" ]]; then
  export NODE_ENV=production
fi

echo "Starting Node server on http://127.0.0.1:$PORT ..."
cd "$REPO_ROOT"
echo "Mirroring Node server logs to console"
node build/index.js 2>&1 &
APP_PID=$!

echo "ComfyUI PID: $COMFY_PID"
echo "App PID: $APP_PID"
echo "Press Ctrl+C to exit (this won't stop background processes)."
wait
