// ComfyUI workflow configuration and constants

export const FINAL_SAVE_NODE_ID = 'final_save_output' // Consistent ID for our dynamically added save node

import type { ComfyUIWorkflow } from '$lib/types'
import { deleteNodesByTitlePattern, findNodeByTitle } from './workflowMapping'

// Dynamic LoRA chain generation
export function generateLoraChain(
  selectedLoras: { name: string; weight: number }[],
  workflow: ComfyUIWorkflow,
  clipSkip: number = 2
): { error?: string } {
  // Remove existing LoRA nodes by title
  deleteNodesByTitlePattern(workflow, 'Load LoRA')

  // Find the base checkpoint loader node
  const checkpointNode = findNodeByTitle(workflow, 'Load Checkpoint')
  if (!checkpointNode) {
    return { error: 'Workflow node not found: Load Checkpoint' }
  }

  const baseNodeId = checkpointNode.nodeId

  // Find existing CLIP skip node in workflow
  let clipSkipNode = findNodeByTitle(workflow, 'CLIP Set Last Layer')
  if (!clipSkipNode) {
    return { error: 'Workflow node not found: CLIP Set Last Layer' }
  }

  if (selectedLoras.length === 0) {
    // If no LoRAs selected, connect CLIP skip node to base checkpoint
    workflow[clipSkipNode.nodeId].inputs.stop_at_clip_layer = -clipSkip
    workflow[clipSkipNode.nodeId].inputs.clip = [baseNodeId, 1]

    // Update all references to point to base checkpoint for model, CLIP skip node for CLIP
    updateLoraReferences(workflow, baseNodeId, clipSkipNode.nodeId)
    return {}
  }

  // Generate LoRA chain with unique IDs
  let previousModelNode = baseNodeId
  let previousClipNode = baseNodeId
  let lastLoraNodeId = baseNodeId

  selectedLoras.forEach((loraData, index) => {
    const nodeId = `lora_${index}_${Date.now()}`

    workflow[nodeId] = {
      inputs: {
        lora_name: loraData.name,
        strength_model: loraData.weight,
        strength_clip: loraData.weight,
        model: [previousModelNode, 0],
        clip: [previousClipNode, 1]
      },
      class_type: 'LoraLoader',
      _meta: {
        title: `Load LoRA ${index + 1}`
      }
    }

    previousModelNode = nodeId
    previousClipNode = nodeId
    lastLoraNodeId = nodeId
  })

  // Update existing CLIP skip node to connect to LoRA chain
  workflow[clipSkipNode.nodeId].inputs.stop_at_clip_layer = -clipSkip
  workflow[clipSkipNode.nodeId].inputs.clip = [lastLoraNodeId, 1]

  // Update all references to use the CLIP skip node for CLIP outputs
  updateLoraReferences(workflow, lastLoraNodeId, clipSkipNode.nodeId)
  return {}
}

function updateLoraReferences(
  workflow: ComfyUIWorkflow,
  targetNodeId: string,
  clipSkipNodeId?: string
) {
  // Update all nodes that use model/clip inputs to reference the LoRA chain output
  // Note: FaceDetailer and upscale nodes are excluded as they use separate checkpoints
  const nodeTitlesToUpdate = [
    'KSampler (inpainting)',
    'CLIP Text Encode (Prompt)',
    'CLIP Text Encode (Zone1)',
    'CLIP Text Encode (Negative)',
    'CLIP Text Encode (Zone2)'
  ]

  nodeTitlesToUpdate.forEach((title) => {
    const node = findNodeByTitle(workflow, title)
    if (node && workflow[node.nodeId] && workflow[node.nodeId].inputs) {
      const nodeInputs = workflow[node.nodeId].inputs
      if (nodeInputs.model && Array.isArray(nodeInputs.model)) {
        nodeInputs.model = [targetNodeId, 0]
      }
      if (nodeInputs.clip && Array.isArray(nodeInputs.clip)) {
        // If we have a CLIP skip node, use it for CLIP references, otherwise use the target node
        nodeInputs.clip = clipSkipNodeId ? [clipSkipNodeId, 0] : [targetNodeId, 1]
      }
    }
  })
}

export const inpaintingWorkflowPrompt = {
  '4': {
    inputs: {
      pixels: ['89', 0],
      vae: ['11', 2]
    },
    class_type: 'VAEEncode',
    _meta: {
      title: 'VAE Encode (for inpainting)'
    }
  },
  '10': {
    inputs: {
      seed: 0,
      steps: 25,
      cfg: 5.0,
      sampler_name: 'euler_ancestral',
      scheduler: 'simple',
      denoise: 0.55,
      model: ['11', 0],
      positive: ['95', 0],
      negative: ['95', 1],
      latent_image: ['4', 0]
    },
    class_type: 'KSampler',
    _meta: {
      title: 'KSampler (inpainting)'
    }
  },
  '101': {
    inputs: {
      destination: ['4', 0],
      source: ['10', 0],
      mask: ['92', 0],
      x: 0,
      y: 0,
      resize_source: true
    },
    class_type: 'LatentCompositeMasked',
    _meta: {
      title: 'Latent Composite Masked'
    }
  },
  '102': {
    inputs: {
      samples: ['101', 0],
      vae: ['11', 2]
    },
    class_type: 'VAEDecode',
    _meta: {
      title: 'VAE Decode for FaceDetailer'
    }
  },
  '11': {
    inputs: {
      ckpt_name: 'model.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'Load Checkpoint'
    }
  },
  '97': {
    inputs: {
      stop_at_clip_layer: -2,
      clip: ['11', 1]
    },
    class_type: 'CLIPSetLastLayer',
    _meta: {
      title: 'CLIP Set Last Layer (Inpainting)'
    }
  },
  '12': {
    inputs: {
      text: 'inpainting prompt',
      clip: ['97', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Prompt)'
    }
  },
  '18': {
    inputs: {
      text: 'negative prompt',
      clip: ['97', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Negative)'
    }
  },
  '89': {
    inputs: {
      image: 'user_image.png'
    },
    class_type: 'LoadImage',
    _meta: {
      title: 'Load Input Image'
    }
  },
  '90': {
    inputs: {
      image: 'temp_mask.png'
    },
    class_type: 'LoadImage',
    _meta: {
      title: 'Load Mask Image'
    }
  },
  '91': {
    inputs: {
      channel: 'red',
      image: ['90', 0]
    },
    class_type: 'ImageToMask',
    _meta: {
      title: 'Convert Image to Mask'
    }
  },
  '92': {
    inputs: {
      mask: ['91', 0],
      device: 'cpu',
      amount: 16
    },
    class_type: 'MaskBlur+',
    _meta: {
      title: 'Blur Mask for Smooth Edges'
    }
  },
  '56': {
    inputs: {
      guide_size: 1024,
      guide_size_for: true,
      max_size: 1536,
      seed: 136661438945910,
      steps: 15,
      cfg: 4.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'simple',
      denoise: 0.4,
      feather: 12,
      noise_mask: true,
      force_inpaint: true,
      bbox_threshold: 0.5,
      bbox_dilation: 10,
      bbox_crop_factor: 3,
      sam_detection_hint: 'center-1',
      sam_dilation: 0,
      sam_threshold: 0.93,
      sam_bbox_expansion: 0,
      sam_mask_hint_threshold: 0.7,
      sam_mask_hint_use_negative: 'False',
      drop_size: 10,
      wildcard: '',
      cycle: 1,
      inpaint_model: false,
      noise_mask_feather: 20,
      tiled_encode: false,
      tiled_decode: false,
      image: ['102', 0],
      model: ['100', 0],
      clip: ['100', 1],
      vae: ['100', 2],
      positive: ['101', 0],
      negative: ['103', 0],
      bbox_detector: ['57', 0],
      sam_model_opt: ['58', 0],
      segm_detector_opt: ['59', 1]
    },
    class_type: 'FaceDetailer',
    _meta: {
      title: 'FaceDetailer (Inpainting)'
    }
  },
  '57': {
    inputs: {
      model_name: 'bbox/face_yolov8m.pt'
    },
    class_type: 'UltralyticsDetectorProvider',
    _meta: {
      title: 'UltralyticsDetectorProvider'
    }
  },
  '58': {
    inputs: {
      model_name: 'sam_vit_b_01ec64.pth',
      device_mode: 'AUTO'
    },
    class_type: 'SAMLoader',
    _meta: {
      title: 'SAMLoader (Impact)'
    }
  },
  '59': {
    inputs: {
      model_name: 'segm/person_yolov8m-seg.pt'
    },
    class_type: 'UltralyticsDetectorProvider',
    _meta: {
      title: 'UltralyticsDetectorProvider'
    }
  },
  '106': {
    inputs: {
      destination: ['89', 0],
      source: ['56', 0],
      mask: ['92', 0],
      x: 0,
      y: 0,
      resize_source: true
    },
    class_type: 'ImageCompositeMasked',
    _meta: {
      title: 'Composite FaceDetailer Result with Original'
    }
  },
  '94': {
    inputs: {
      image: ['89', 0],
      detect_hand: 'enable',
      detect_body: 'enable',
      detect_face: 'enable',
      resolution: 512
    },
    class_type: 'OpenposePreprocessor',
    _meta: {
      title: 'OpenPose Preprocessor'
    }
  },
  '95': {
    inputs: {
      positive: ['12', 0],
      negative: ['18', 0],
      control_net: ['96', 0],
      image: ['94', 0],
      vae: ['11', 2],
      strength: 1.0,
      start_percent: 0.0,
      end_percent: 1.0
    },
    class_type: 'ControlNetApplyAdvanced',
    _meta: {
      title: 'ControlNet Apply Advanced (OpenPose)'
    }
  },
  '96': {
    inputs: {
      control_net_name: 'OpenPoseXL2.safetensors'
    },
    class_type: 'ControlNetLoader',
    _meta: {
      title: 'Load ControlNet Model (OpenPose SDXL)'
    }
  }
}

export const defaultWorkflowPrompt = {
  '1': {
    inputs: {
      value: 0,
      width: 832,
      height: 1216
    },
    class_type: 'SolidMask',
    _meta: {
      title: 'SolidMask'
    }
  },
  '2': {
    inputs: {
      value: 1,
      width: 832,
      height: 1216
    },
    class_type: 'SolidMask',
    _meta: {
      title: 'SolidMask'
    }
  },
  '3': {
    inputs: {
      model: ['4', 0],
      base_mask: ['2', 0],
      cond_1: ['7', 0],
      mask_1: ['38', 0],
      cond_2: ['15', 0],
      mask_2: ['39', 0]
    },
    class_type: 'AttentionCouple|cgem156',
    _meta: {
      title: 'Attention Couple 🍌'
    }
  },
  '4': {
    inputs: {
      ckpt_name: 'zenijiMixKIllust_v10.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'Load Checkpoint'
    }
  },
  '5': {
    inputs: {
      stop_at_clip_layer: -2,
      clip: ['4', 1]
    },
    class_type: 'CLIPSetLastLayer',
    _meta: {
      title: 'CLIP Set Last Layer'
    }
  },
  '6': {
    inputs: {
      text: 'masterpiece, best quality, ultra-detailed, 8k resolution, high dynamic range, absurdres, stunningly beautiful, intricate details, sharp focus, detailed eyes, cinematic color grading, high-resolution texture, nails, 1girl, looking away, wariza, hand in own panties,abandoned factory, trash, puddle, water pipe, valve, machinery, fog, grass, dirt,tilted angle, close up, upper body with face focus, from_below,Color Contrast Lighting (Captured on a Canonet QL17 GIII with a 40mm f/1.7 lens, opposing colored lights — such as orange and blue — cast dynamic gradients and reflections on the subject and surroundings)',
      clip: ['5', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (All)'
    }
  },
  '7': {
    inputs: {
      text: '1girl, looking away, wariza, hand in own panties,blush, nuzzling lips,white skin,(medium breasts:1.3), hanging breasts, breasts squeezed together, slim waist, wide hips, huge ass, thick thighs, (slim legs:1.2),blonde hair, messy hair, twintails, low twintails, short hair, bangs, long sidelocks, wide-brimmed hat, hair ornament, detailed hair,blue eyes, round eyes, tareme,skindentation (lowleg:1.2) high-waist thong green bikini, wedgie, covered nipples,white pantyhose, brown_footwear, stiletto_heels, glossy lips, lips, mini face, tiny face',
      clip: ['5', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Zone1)'
    }
  },
  '8': {
    inputs: {
      add_noise: true,
      noise_seed: 607712091356808,
      cfg: 4.5,
      model: ['3', 0],
      positive: ['6', 0],
      negative: ['9', 0],
      sampler: ['10', 0],
      sigmas: ['11', 0],
      latent_image: ['12', 0]
    },
    class_type: 'SamplerCustom',
    _meta: {
      title: 'SamplerCustom'
    }
  },
  '9': {
    inputs: {
      text: '(worst quality:2), (low quality:2), (normal quality:2), bad anatomy, bad proportions, poorly drawn face, poorly drawn hands, missing fingers, extra limbs, blurry, pixelated, distorted, lowres, jpeg artifacts, watermark, signature, text, (deformed:1.5), (bad hands:1.3), overexposed, underexposed, censored, mutated, extra fingers, cloned face, bad eyes, modern, recent, old, oldest, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured, long body, lowres, bad anatomy, bad hands, missing fingers, extra fingers, extra digits, fewer digits, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated',
      clip: ['5', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Negative)'
    }
  },
  '10': {
    inputs: {
      sampler_name: 'euler_ancestral'
    },
    class_type: 'KSamplerSelect',
    _meta: {
      title: 'KSamplerSelect'
    }
  },
  '11': {
    inputs: {
      scheduler: 'simple',
      steps: 25,
      denoise: 1,
      model: ['3', 0]
    },
    class_type: 'BasicScheduler',
    _meta: {
      title: 'BasicScheduler'
    }
  },
  '12': {
    inputs: {
      width: 832,
      height: 1216,
      batch_size: 1
    },
    class_type: 'EmptyLatentImage',
    _meta: {
      title: 'Empty Latent Image'
    }
  },
  '13': {
    inputs: {
      samples: ['8', 0],
      vae: ['14', 0]
    },
    class_type: 'VAEDecode',
    _meta: {
      title: 'VAE Decode'
    }
  },
  '14': {
    inputs: {
      vae_name: 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Load VAE'
    }
  },
  '15': {
    inputs: {
      text: '',
      clip: ['5', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Zone2)'
    }
  },
  '17': {
    inputs: {
      images: ['13', 0]
    },
    class_type: 'PreviewImage',
    _meta: {
      title: 'Preview Image'
    }
  },
  '18': {
    inputs: {
      images: ['44', 0]
    },
    class_type: 'PreviewImage',
    _meta: {
      title: 'Preview Image'
    }
  },
  '20': {
    inputs: {
      model_name: 'bbox/face_yolov8m.pt'
    },
    class_type: 'UltralyticsDetectorProvider',
    _meta: {
      title: 'UltralyticsDetectorProvider'
    }
  },
  '21': {
    inputs: {
      model_name: 'sam_vit_b_01ec64.pth',
      device_mode: 'AUTO'
    },
    class_type: 'SAMLoader',
    _meta: {
      title: 'SAMLoader (Impact)'
    }
  },
  '22': {
    inputs: {
      model_name: 'segm/person_yolov8m-seg.pt'
    },
    class_type: 'UltralyticsDetectorProvider',
    _meta: {
      title: 'UltralyticsDetectorProvider'
    }
  },
  '23': {
    inputs: {
      seed: 83865135657668,
      steps: 10,
      cfg: 4.5,
      sampler_name: 'res_multistep',
      scheduler: 'kl_optimal',
      denoise: 0.35,
      model: ['26', 0],
      positive: ['27', 0],
      negative: ['28', 0],
      latent_image: ['43', 0]
    },
    class_type: 'KSampler',
    _meta: {
      title: 'KSampler (Upscale)'
    }
  },
  '26': {
    inputs: {
      ckpt_name: 'zenijiMixKIllust_v10.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'Upscale Checkpoint Loader'
    }
  },
  '27': {
    inputs: {
      text: 'masterpiece, best quality, ultra-detailed, 8k resolution, high dynamic range, absurdres, stunningly beautiful, intricate details, sharp focus, detailed eyes, cinematic color grading, high-resolution texture, nails, 1girl, looking away, wariza, hand in own panties,abandoned factory, trash, puddle, water pipe, valve, machinery, fog, grass, dirt,tilted angle, close up, upper body with face focus, from_below,Color Contrast Lighting (Captured on a Canonet QL17 GIII with a 40mm f/1.7 lens, opposing colored lights — such as orange and blue — cast dynamic gradients and reflections on the subject and surroundings)',
      clip: ['26', 1]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'Upscale CLIP Text Encode (Positive)'
    }
  },
  '28': {
    inputs: {
      text: '(worst quality:2), (low quality:2), (normal quality:2), bad anatomy, bad proportions, poorly drawn face, poorly drawn hands, missing fingers, extra limbs, blurry, pixelated, distorted, lowres, jpeg artifacts, watermark, signature, text, (deformed:1.5), (bad hands:1.3), overexposed, underexposed, censored, mutated, extra fingers, cloned face, bad eyes, modern, recent, old, oldest, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured, long body, lowres, bad anatomy, bad hands, missing fingers, extra fingers, extra digits, fewer digits, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated',
      clip: ['26', 1]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'Upscale CLIP Text Encode (Negative)'
    }
  },
  '30': {
    inputs: {
      upscale_model: ['31', 0],
      image: ['13', 0]
    },
    class_type: 'ImageUpscaleWithModel',
    _meta: {
      title: 'Upscale Image (using Model)'
    }
  },
  '31': {
    inputs: {
      model_name: '2x_NMKD-UpgifLiteV2_210k.pth'
    },
    class_type: 'UpscaleModelLoader',
    _meta: {
      title: 'Load Upscale Model'
    }
  },
  '33': {
    inputs: {
      upscale_method: 'nearest-exact',
      width: 1248,
      height: 1824,
      crop: 'disabled',
      image: ['30', 0]
    },
    class_type: 'ImageScale',
    _meta: {
      title: 'Upscale Image'
    }
  },
  '34': {
    inputs: {
      images: ['45', 0]
    },
    class_type: 'PreviewImage',
    _meta: {
      title: 'Preview Image'
    }
  },
  '35': {
    inputs: {
      ckpt_name: 'zenijiMixKIllust_v10.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'FaceDetailer Checkpoint Loader'
    }
  },
  '36': {
    inputs: {
      vae_name: 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Load VAE (FaceDetailer)'
    }
  },
  '37': {
    inputs: {
      image: 'left-horizontal-mask.png'
    },
    class_type: 'LoadImage',
    _meta: {
      title: 'Load Image'
    }
  },
  '38': {
    inputs: {
      channel: 'red',
      image: ['37', 0]
    },
    class_type: 'ImageToMask',
    _meta: {
      title: 'Convert Image to Mask'
    }
  },
  '39': {
    inputs: {
      mask: ['38', 0]
    },
    class_type: 'InvertMask',
    _meta: {
      title: 'InvertMask'
    }
  },
  '40': {
    inputs: {
      text: 'masterpiece, best quality, ultra-detailed, 8k resolution, high dynamic range, absurdres, stunningly beautiful, intricate details, sharp focus, detailed eyes, cinematic color grading, high-resolution texture, nails, 1girl, looking away, wariza, hand in own panties,abandoned factory, trash, puddle, water pipe, valve, machinery, fog, grass, dirt,tilted angle, close up, upper body with face focus, from_below,Color Contrast Lighting (Captured on a Canonet QL17 GIII with a 40mm f/1.7 lens, opposing colored lights — such as orange and blue — cast dynamic gradients and reflections on the subject and surroundings)',
      clip: ['35', 1]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'FaceDetailer CLIP Text Encode (Positive)'
    }
  },
  '41': {
    inputs: {
      text: '(worst quality:2), (low quality:2), (normal quality:2), bad anatomy, bad proportions, poorly drawn face, poorly drawn hands, missing fingers, extra limbs, blurry, pixelated, distorted, lowres, jpeg artifacts, watermark, signature, text, (deformed:1.5), (bad hands:1.3), overexposed, underexposed, censored, mutated, extra fingers, cloned face, bad eyes, modern, recent, old, oldest, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured, long body, lowres, bad anatomy, bad hands, missing fingers, extra fingers, extra digits, fewer digits, cropped, very displeasing, (worst quality, bad quality:1.2), sketch, jpeg artifacts, signature, watermark, username, (censored, bar_censor, mosaic_censor:1.2), simple background, conjoined, bad ai-generated',
      clip: ['35', 1]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'FaceDetailer CLIP Text Encode (Negative)'
    }
  },
  '42': {
    inputs: {
      vae_name: 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Load VAE (Upscale)'
    }
  },
  '43': {
    inputs: {
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
      pixels: ['33', 0],
      vae: ['42', 0]
    },
    class_type: 'VAEEncodeTiled',
    _meta: {
      title: 'VAE Encode (Tiled)'
    }
  },
  '44': {
    inputs: {
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
      samples: ['23', 0],
      vae: ['42', 0]
    },
    class_type: 'VAEDecodeTiled',
    _meta: {
      title: 'VAE Decode (Tiled)'
    }
  },
  '45': {
    inputs: {
      guide_size: 512,
      guide_size_for: true,
      max_size: 1024,
      seed: 112966285875146,
      steps: 10,
      cfg: 4.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'karras',
      denoise: 0.4,
      feather: 5,
      noise_mask: true,
      force_inpaint: true,
      wildcard: '',
      cycle: 1,
      inpaint_model: false,
      noise_mask_feather: 20,
      tiled_encode: false,
      tiled_decode: false,
      image: ['44', 0],
      segs: ['47', 0],
      model: ['35', 0],
      clip: ['35', 1],
      vae: ['36', 0],
      positive: ['40', 0],
      negative: ['41', 0]
    },
    class_type: 'DetailerForEach',
    _meta: {
      title: 'FaceDetailer'
    }
  },
  '47': {
    inputs: {
      bbox_threshold: 0.2,
      bbox_dilation: 5,
      crop_factor: 2,
      drop_size: 10,
      sub_threshold: 0.2,
      sub_dilation: 5,
      sub_bbox_expansion: 0,
      sam_mask_hint_threshold: 0.7,
      post_dilation: 0,
      bbox_detector: ['20', 0],
      image: ['44', 0],
      sam_model_opt: ['21', 0],
      segm_detector_opt: ['20', 1]
    },
    class_type: 'ImpactSimpleDetectorSEGS',
    _meta: {
      title: 'Simple Detector (SEGS)'
    }
  }
}
