// ComfyUI workflow configuration and constants

export const FINAL_SAVE_NODE_ID = 'final_save_output' // Consistent ID for our dynamically added save node

import type { ComfyUIWorkflow } from '$lib/types'

// Configure CLIP skip for the workflow
export function configureClipSkip(workflow: ComfyUIWorkflow, clipSkip: number) {
  // Update standalone CLIP skip nodes
  if (workflow['97']) {
    // Inpainting workflow
    workflow['97'].inputs.stop_at_clip_layer = -clipSkip
  }
  if (workflow['98']) {
    // Default workflow
    workflow['98'].inputs.stop_at_clip_layer = -clipSkip
  }
  if (workflow['99']) {
    // LoRA chain workflow
    workflow['99'].inputs.stop_at_clip_layer = -clipSkip
  }
}

// Dynamic LoRA chain generation
export function generateLoraChain(
  selectedLoras: { name: string; weight: number }[],
  workflow: ComfyUIWorkflow,
  clipSkip: number = 2
) {
  // Remove existing LoRA nodes (70-85) and CLIP skip node (99)
  for (let i = 70; i <= 85; i++) {
    delete workflow[i.toString()]
  }
  delete workflow['99']

  if (selectedLoras.length === 0) {
    // If no LoRAs selected, add CLIP skip node for base checkpoint
    const clipSkipNodeId = '99'
    workflow[clipSkipNodeId] = {
      inputs: {
        stop_at_clip_layer: -clipSkip,
        clip: ['11', 1]
      },
      class_type: 'CLIPSetLastLayer',
      _meta: {
        title: 'CLIP Set Last Layer (Base)'
      }
    }

    // Update all references to point to node '11' for model, CLIP skip node for CLIP
    updateLoraReferences(workflow, '11', clipSkipNodeId)
    return
  }

  // Generate LoRA chain starting from node 70
  let previousModelNode = '11'
  let previousClipNode = '11'
  let lastLoraNodeId = '11'

  selectedLoras.forEach((loraData, index) => {
    const nodeId = (70 + index).toString()

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

  // Add CLIP skip node after LoRA chain
  const clipSkipNodeId = '99'
  workflow[clipSkipNodeId] = {
    inputs: {
      stop_at_clip_layer: -clipSkip,
      clip: [lastLoraNodeId, 1]
    },
    class_type: 'CLIPSetLastLayer',
    _meta: {
      title: 'CLIP Set Last Layer (LoRA)'
    }
  }

  // Update all references to use the CLIP skip node for CLIP outputs
  updateLoraReferences(workflow, lastLoraNodeId, clipSkipNodeId)
}

function updateLoraReferences(
  workflow: ComfyUIWorkflow,
  targetNodeId: string,
  clipSkipNodeId?: string
) {
  // Update all nodes that were referencing '85' to use the target node
  // Note: FaceDetailer nodes (56, 69) are excluded as they use separate checkpoint
  const nodesToUpdate = ['10', '12', '13', '18', '51']

  nodesToUpdate.forEach((nodeId) => {
    if (workflow[nodeId] && workflow[nodeId].inputs) {
      if (workflow[nodeId].inputs.model && Array.isArray(workflow[nodeId].inputs.model)) {
        workflow[nodeId].inputs.model = [targetNodeId, 0]
      }
      if (workflow[nodeId].inputs.clip && Array.isArray(workflow[nodeId].inputs.clip)) {
        // If we have a CLIP skip node, use it for CLIP references, otherwise use the target node
        workflow[nodeId].inputs.clip = clipSkipNodeId ? [clipSkipNodeId, 0] : [targetNodeId, 1]
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
  '2': {
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
  '3': {
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
  '10': {
    inputs: {
      model: ['85', 0],
      base_mask: ['3', 0],
      cond_1: ['13', 0],
      mask_1: ['87', 0],
      cond_2: ['51', 0],
      mask_2: ['88', 0]
    },
    class_type: 'AttentionCouple|cgem156',
    _meta: {
      title: 'Attention Couple 🍌'
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
  '98': {
    inputs: {
      stop_at_clip_layer: -2,
      clip: ['11', 1]
    },
    class_type: 'CLIPSetLastLayer',
    _meta: {
      title: 'CLIP Set Last Layer'
    }
  },
  '12': {
    inputs: {
      text: 'overall base prompt',
      clip: ['98', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Prompt)'
    }
  },
  '13': {
    inputs: {
      text: 'left side prompt',
      clip: ['98', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Prompt)'
    }
  },
  '14': {
    inputs: {
      add_noise: true,
      noise_seed: 712011592294887,
      cfg: 4.5,
      model: ['10', 0],
      positive: ['12', 0],
      negative: ['18', 0],
      sampler: ['15', 0],
      sigmas: ['45', 0],
      latent_image: ['16', 0]
    },
    class_type: 'SamplerCustom',
    _meta: {
      title: 'SamplerCustom'
    }
  },
  '15': {
    inputs: {
      sampler_name: 'euler_ancestral'
    },
    class_type: 'KSamplerSelect',
    _meta: {
      title: 'KSamplerSelect'
    }
  },
  '16': {
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
  '18': {
    inputs: {
      text: 'negative prompt',
      clip: ['98', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Prompt)'
    }
  },
  '19': {
    inputs: {
      samples: ['14', 1],
      vae: ['11', 2]
    },
    class_type: 'VAEDecode',
    _meta: {
      title: 'VAE Decode'
    }
  },
  '45': {
    inputs: {
      scheduler: 'simple',
      steps: 25,
      denoise: 1,
      model: ['10', 0]
    },
    class_type: 'BasicScheduler',
    _meta: {
      title: 'BasicScheduler'
    }
  },
  '51': {
    inputs: {
      text: 'right side prompt',
      clip: ['98', 0]
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Prompt)'
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
      image: ['19', 0],
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
      title: 'FaceDetailer1'
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
  '64': {
    inputs: {
      upscale_model: ['65', 0],
      image: ['19', 0]
    },
    class_type: 'ImageUpscaleWithModel',
    _meta: {
      title: 'Upscale Image (using Model)'
    }
  },
  '65': {
    inputs: {
      model_name: '4x_foolhardy_Remacri.pt'
    },
    class_type: 'UpscaleModelLoader',
    _meta: {
      title: 'Load Upscale Model'
    }
  },
  '69': {
    inputs: {
      guide_size: 1024,
      guide_size_for: true,
      max_size: 1536,
      seed: 562575562233700,
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
      image: ['64', 0],
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
      title: 'FaceDetailer'
    }
  },
  '86': {
    inputs: {
      image: 'static\\left-horizontal-mask.png'
    },
    class_type: 'LoadImage',
    _meta: {
      title: 'Load Image'
    }
  },
  '87': {
    inputs: {
      channel: 'red',
      image: ['86', 0]
    },
    class_type: 'ImageToMask',
    _meta: {
      title: 'Convert Image to Mask'
    }
  },
  '88': {
    inputs: {
      mask: ['87', 0]
    },
    class_type: 'InvertMask',
    _meta: {
      title: 'InvertMask'
    }
  },
  '100': {
    inputs: {
      ckpt_name: 'zenijiMixKIllust_v10.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'FaceDetailer Checkpoint Loader'
    }
  },
  '101': {
    inputs: {
      clip: ['100', 1],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'FaceDetailer CLIP Text Encode (Positive)'
    }
  },
  '103': {
    inputs: {
      clip: ['100', 1],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'FaceDetailer CLIP Text Encode (Negative)'
    }
  }
}
