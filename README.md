# Tag Painter

English | [한국어](README.ko.md)

Tag Painter is a SvelteKit-based web application that integrates with ComfyUI for AI image generation. Create diverse character art using zone-based prompting with regional composition control.

![Tag Painter Screenshot](docs/images/app-screenshot-en.png)

## Installation

### 1. Download Release

- Get the latest `tag-painter-release-*.zip` from GitHub Releases: https://github.com/Julian-adv/tag-painter/releases
- Extract it to any folder you like.

### 2. Start Application

- Windows: `start.bat`
- macOS/Linux: `bash start.sh`

The script starts the app and opens it in your browser. The first launch can take a while due to environment setup (ComfyUI installation/venv setup/model downloads).
If it doesn't open automatically, go to `http://127.0.0.1:3000/`.

After installation, you may see a "No checkpoints" dialog. In that case, download a checkpoint (base model) from Civitai or Hugging Face and place it in `ComfyUI/models/checkpoints/`. After placing the file, click the refresh (🔄) button to reload the model list.

<img src="docs/images/no-checkpoints-en.png" alt="No checkpoints dialog" width="333" />

<img src="docs/images/checkpoints-refresh-en.png" alt="Refresh checkpoints list" width="274" />

- Zeniji*Mix K-illust — https://civitai.com/models/1651774?modelVersionId=1869616
  \_The screenshot above was generated with this model.*

### Open Settings

Click the gear (Settings) button in the top toolbar to open the settings dialog. You can configure:

- Language: switch between English/Korean
- Output folder: image generation output directory
- Generation parameters: sampler, steps, CFG scale, seed, etc.
- Default quality prompt: quality-related prefix text
- LoRA list: select/manage LoRA models

![Settings dialog](docs/images/settings-en.png)

### Composition & Zone Prompts

Choose a composition to split the canvas into zones (e.g., left/right or top/bottom). Enter prompts for each zone to apply them only to that region.

<img src="docs/images/zones-en.png" alt="Composition and zone prompts" width="273" />

- ALL prompt: applies to every zone.
- Zone 1 / Zone 2 prompts: apply only to the respective zone.
- Inpainting prompt: used when you perform inpainting.

Using composition with per-zone prompts lets you control different elements (character, background, outfit, etc.) precisely by region.

### Tags & Wildcards Editor

When you press Generate, the UI shows which tags will actually be used based on the current combination so you can verify them at a glance.

Double-click a tag to open the wildcards editor and fine‑tune random choices.

<img src="docs/images/tags-en.png" alt="Tags area" width="265" />

<img src="docs/images/wildcards-editor-en.png" alt="Wildcards editor" width="600" />

Usage

| Item                             | Description                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node double-click (Enter)        | Edit the node name/content inline.                                                                                                               |
| Ctrl+Enter                       | Add a sibling node next to the current node.                                                                                                     |
| Drag & drop                      | Reorder or move nodes.                                                                                                                           |
| Random                           | Picks a new candidate at random on every generation.                                                                                             |
| Consistent random                | Picks the same candidate across ALL, Zone 1, and Zone 2 for the same seed/structure (useful for poses or elements that must match across zones). |
| Composition                      | Determines the image layout: single zone, left/right split, or top/bottom split.                                                                 |
| Weight                           | Controls selection probability (higher weight increases the chance this node is chosen among candidates).                                        |
| Disable                          | Exclude specific nodes (or patterns) from generation.                                                                                            |
| Multi‑select/Group (Shift+click) | Select a range, then press Group to create a parent with the selected nodes as children.                                                         |
| Add/Delete                       | Use the toolbar/context menu to add a child, add a top‑level node, or delete.                                                                    |
| Expand/Collapse                  | Expand/collapse all nodes to review the structure quickly.                                                                                       |
| Pin                              | Force a node to be selected during generation.                                                                                                   |

### What Gets Installed Automatically

- ComfyUI with a Python venv (created/fixed as needed).
- Required custom nodes:
  - cgem156-ComfyUI — https://github.com/laksjdjf/cgem156-ComfyUI
  - ComfyUI-Custom-Scripts — https://github.com/pythongosssss/ComfyUI-Custom-Scripts
  - ComfyUI-Impact-Pack — https://github.com/ltdrdata/ComfyUI-Impact-Pack
  - ComfyUI-Impact-Subpack — https://github.com/ltdrdata/ComfyUI-Impact-Subpack
  - ComfyUI_essentials — https://github.com/cubiq/ComfyUI_essentials
  - comfyui_controlnet_aux (OpenPose/DWpose preprocessors) — https://github.com/Fannovel16/comfyui_controlnet_aux
- Additional Python packages:
  - pandas — required by the WD tagger utilities in cgem156-ComfyUI
- Helper models for the above nodes:
  - YOLO (person/face):
    - person_yolov8m-seg.pt — https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8m-seg.pt
    - face_yolov8m.pt — https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt
  - SAM: sam_vit_b_01ec64.pth — https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/sams/sam_vit_b_01ec64.pth
  - VAE: fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors — https://huggingface.co/moonshotmillion/VAEfixFP16ErrorsSDXLLowerMemoryUse_v10/resolve/main/fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors
  - ControlNet (OpenPose XL): OpenPoseXL2.safetensors — attempts from Hugging Face; placed in `ComfyUI/models/controlnet/`
  - ControlNet Aux annotators:
    - body_pose_model.pth — https://huggingface.co/lllyasviel/Annotators/resolve/main/body_pose_model.pth
    - hand_pose_model.pth — https://huggingface.co/lllyasviel/Annotators/resolve/main/hand_pose_model.pth
    - facenet.pth — https://huggingface.co/lllyasviel/Annotators/resolve/main/facenet.pth
- Example LoRA models downloaded to `ComfyUI/models/loras/`:
  - MoriiMee_Gothic_Niji_Style_Illustrious_r1 — https://huggingface.co/NeigeSnowflake/neigeworkflow/resolve/main/MoriiMee_Gothic_Niji_Style_Illustrious_r1.safetensors
  - spo_sdxl_10ep_4k-data_lora_webui — https://civitai.com/api/download/models/567119
  - Sinozick_Style_XL_Pony — https://civitai.com/api/download/models/481798
  - Fant5yP0ny — https://huggingface.co/LyliaEngine/Fant5yP0ny/resolve/main/Fant5yP0ny.safetensors?download=true

In addition, the setup installs onnxruntime for the DWpose/OpenPose preprocessors used by inpainting:

- If an NVIDIA GPU is detected: installs `onnxruntime-gpu` (falls back to `onnxruntime` if needed)
- Otherwise: installs `onnxruntime`

If auto-download of `OpenPoseXL2.safetensors` fails, download it manually and place it at `ComfyUI/models/controlnet/OpenPoseXL2.safetensors`.

### Run Options

- `-NoComfy`: Use your existing ComfyUI; skip install/start.
- `-ComfyOnly`: Start only ComfyUI; do not launch Tag Painter.

## License

This project is open source. See the LICENSE file for details.

## Chroma Workflow Titles

Tag Painter applies parameters to Chroma workflows by matching node `_meta.title` (substring match, case‑sensitive) and some class types. To avoid ambiguity, include one node per title below.

- Required (Main path)
  - `CLIP Text Encode (Positive Prompt)` — main positive prompt text.
  - `CLIP Text Encode (Negative Prompt)` — main negative prompt text.
  - `Empty Latent Image` — latent canvas; width/height are applied from Settings.
  - `KSampler (Main)` or `KSampler` — main sampler. Steps/CFG/sampler/scheduler/seed are applied.
  - `CLIP Set Last Layer` — optional CLIP skip node; last layer is set from Settings.
  - `VAE Decode (Base)` — base decode used when not upscaling and not using FaceDetailer.
  - Main model loader — have a `UNETLoader` in the main path. Tag Painter sets `unet_name` on the first `UNETLoader` (by class type).

- Optional (FaceDetailer)
  - `FaceDetailer` — main FD node. Seed/steps/CFG/sampler/scheduler/denoise are applied. Its `image` input is wired from `VAE Decode (Upscale)` when upscaling, otherwise from `VAE Decode (Base)`. The `wildcard` input receives a combined Zone 1/Zone 2 prompt.
  - `Load Checkpoint` — checkpoint loader used by FaceDetailer. Provides model(0), clip(1), vae(2) to FD when you use an SDXL path for FD.
  - `Load VAE` — VAELoader used when not using embedded VAE for FD; its `vae_name` is applied from settings.
  - `Upscale CLIP Text Encode (Positive)` — positive text encoder used by FD/upscale branches.
  - `Upscale CLIP Text Encode (Negative)` — negative text encoder used by FD/upscale branches.

- Optional (Upscale)
  - `Latent Upscale` — target latent width/height are set to base size × scale.
  - `SDXL VAE Encode` — VAE encode node for the upscale path; VAE input is set per settings (embedded or external `Load VAE`).
  - `KSampler (Upscale)` — steps/CFG/sampler/scheduler/denoise are applied; the model input remains as defined in your workflow.
  - `Upscale CLIP Text Encode (Positive)` — upscale positive prompt; text and CLIP input are set.
  - `Upscale CLIP Text Encode (Negative)` — upscale negative prompt; text and CLIP input are set.
  - `VAE Decode (Upscale)` — final decode for the upscale branch (used as the image source when upscaling is enabled).

Behavior and notes:
- Title matching uses substring includes and is case‑sensitive. Keep exactly one node per title.
- If a title is missing, Tag Painter still configures by class type where possible: `RandomNoise` (seed), `BasicScheduler` (steps/scheduler), `CFGGuider` (cfg), `KSamplerSelect` (sampler), first `UNETLoader` (checkpoint), first `VAELoader` (VAE).
- The FaceDetailer checkpoint loader should be the only node titled `Load Checkpoint` in a Chroma workflow. The main model uses `UNETLoader`; Tag Painter does not override any main `CheckpointLoaderSimple`.
- If your pipeline uses a `SamplerCustom` node (titled `SamplerCustom`), Tag Painter will set `cfg` and `noise_seed` on it when main `KSampler` nodes are not present.
- A final `SaveImageWebsocket` node is injected automatically with a fixed ID (`final_save_output`). You do not need to include a save node.

## Qwen Workflow Titles

Tag Painter resolves Qwen workflows by matching the `_meta.title` of nodes (substring match, case‑sensitive). Make sure your workflow includes the following titles so parameters can be applied without relying on fixed node IDs.

- Required (Main path)
  - `KSampler` — main sampler. Steps/CFG/sampler/scheduler/seed are applied here.
  - `Model Sampling Aura Flow` — receives the model after UNet/LoRA chain; feeds `KSampler.model`.
  - `Load Qwen UNet` — base UNETLoader. The selected checkpoint overrides `unet_name` here.
  - `Load Qwen VAE` — VAELoader. If a VAE is selected (not `__embedded__`), its name is set here.
  - `CLIP Text Encode (Positive)` — positive prompt text; should be wired to your Qwen CLIP loader.
  - `CLIP Text Encode (Negative)` — negative prompt text; should be wired to your Qwen CLIP loader.
  - `Empty Latent Image` — latent canvas; width/height are applied.
  - `VAE Decode` — base decode used when not upscaling and not using FaceDetailer.

- Optional (FaceDetailer)
  - Always:
    - `FaceDetailer` — main FD node. Seed/steps/CFG/sampler/scheduler/denoise are applied.
    - `FaceDetailer CLIP Text Encode (Positive)` — FD positive prompt (text and CLIP input are set).
    - `FaceDetailer CLIP Text Encode (Negative)` — FD negative prompt (text and CLIP input are set).
    - Input image is wired from `Upscale VAE Decode` if upscaling is enabled, otherwise from base `VAE Decode`.
  - Qwen FD path:
    - `FaceDetailer UNet Loader (Qwen)` — UNETLoader for FD; checkpoint set from settings/selection.
    - `FaceDetailer Model Sampling Aura Flow (Qwen)` — model sampling wrapper for FD (wired to FD model).
    - `FaceDetailer CLIP Loader (Qwen)` — CLIP loader for FD (wired to FD CLIP and FD text encoders).
    - `FaceDetailer VAE Loader (Qwen)` — VAELoader for FD (wired to FD VAE and name set).
  - SDXL FD path:
    - `FaceDetailer Checkpoint Loader (SDXL)` — provides model(0), clip(1), vae(2) to `FaceDetailer`.
    - `FaceDetailer VAE Loader (SDXL)` — used when not using embedded VAE from the checkpoint.

- Optional (Upscale)
  - `Latent Upscale` — target latent width/height are set using base size × scale.
  - `SDXL VAE Encode` — VAE encode node for the upscale path; VAE input is set per settings.
  - `KSampler (Upscale)` — steps/CFG/sampler/scheduler/denoise are applied; model input is wired.
  - Qwen upscale path:
    - `Upscale UNet Loader (Qwen)` — UNETLoader; checkpoint set from settings/selection.
    - `Upscale Model Sampling Aura Flow (Qwen)` — model sampling wrapper for upscale (wired to KSampler (Upscale)).
    - `Upscale CLIP Loader (Qwen)` — CLIP loader for upscale encoders.
    - `Upscale VAE Loader (Qwen)` — VAELoader; name set and used for both encode/decode.
    - `Upscale CLIP Text Encode (Positive)` — upscale positive text; CLIP input is set.
    - `Upscale CLIP Text Encode (Negative)` — upscale negative text; CLIP input is set.
    - `Upscale VAE Decode` — final decode for the upscale branch.
  - SDXL upscale path:
    - `Upscale Checkpoint Loader (SDXL)` — provides model(0), clip(1), vae(2) to the upscale branch.
    - `Upscale VAE Loader (SDXL)` — used when not using embedded VAE from the checkpoint.
    - `Upscale CLIP Text Encode (Positive)` — upscale positive text; CLIP set from checkpoint.
    - `Upscale CLIP Text Encode (Negative)` — upscale negative text; CLIP set from checkpoint.
    - `Upscale VAE Decode` — final decode for the upscale branch.

Behavior and notes:
- LoRA chain: Tag Painter inserts `LoraLoaderModelOnly` nodes titled `Load Qwen LoRA N` and wires them between `Load Qwen UNet` and `Model Sampling Aura Flow` automatically.
- Title matching uses substring includes and is case‑sensitive. Keep one node per title to avoid ambiguity.
- If a title is missing, Tag Painter may fall back to default IDs only in some cases; use the titles above for reliable behavior.
- Final save is added automatically as a `SaveImageWebsocket` node with a fixed ID (`final_save_output`). You do not need to include a save node in your workflow.
