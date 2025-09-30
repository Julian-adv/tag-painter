import type { ComfyUIWorkflow } from '$lib/types'

export const qwenWorkflowPrompt: ComfyUIWorkflow = {
  '3': {
    inputs: {
      seed: 0,
      steps: 8,
      cfg: 1.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'simple',
      denoise: 1,
      model: ['66', 0],
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['70', 0]
    },
    class_type: 'KSampler',
    _meta: {
      title: 'KSampler'
    }
  },
  '6': {
    inputs: {
      clip: ['38', 0],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Positive)'
    }
  },
  '7': {
    inputs: {
      clip: ['38', 0],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'CLIP Text Encode (Negative)'
    }
  },
  '8': {
    inputs: {
      samples: ['3', 0],
      vae: ['39', 0]
    },
    class_type: 'VAEDecode',
    _meta: {
      title: 'VAE Decode'
    }
  },
  '37': {
    inputs: {
      unet_name: 'qwen_image_fp8_e4m3fn.safetensors',
      weight_dtype: 'fp8_e4m3fn'
    },
    class_type: 'UNETLoader',
    _meta: {
      title: 'Load Qwen UNet'
    }
  },
  '38': {
    inputs: {
      clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
      type: 'qwen_image',
      device: 'default'
    },
    class_type: 'CLIPLoader',
    _meta: {
      title: 'Load Qwen CLIP'
    }
  },
  '39': {
    inputs: {
      vae_name: 'qwen_image_vae.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Load Qwen VAE'
    }
  },
  '70': {
    inputs: {
      width: 832,
      height: 1216,
      batch_size: 1
    },
    class_type: 'EmptySD3LatentImage',
    _meta: {
      title: 'Empty Latent Image'
    }
  },
  '66': {
    inputs: {
      model: ['37', 0],
      shift: 3.1
    },
    class_type: 'ModelSamplingAuraFlow',
    _meta: {
      title: 'Model Sampling Aura Flow'
    }
  },
  '56': {
    inputs: {
      guide_size: 1024,
      guide_size_for: true,
      max_size: 1536,
      seed: 0,
      steps: 28,
      cfg: 4.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'simple',
      denoise: 0.75,
      feather: 5,
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
      image: ['126', 0],
      model: ['71', 0],
      clip: ['71', 1],
      vae: ['72', 0],
      positive: ['73', 0],
      negative: ['74', 0],
      bbox_detector: ['57', 0],
      sam_model_opt: ['58', 0],
      segm_detector_opt: ['59', 1]
    },
    class_type: 'FaceDetailer',
    _meta: {
      title: 'FaceDetailer'
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
      title: 'SAMLoader'
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
  '71': {
    inputs: {
      ckpt_name: 'zenijiMixKIllust_v10.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'FaceDetailer Checkpoint Loader (SDXL)'
    }
  },
  '75': {
    inputs: {
      unet_name: 'qwen_image_fp8_e4m3fn.safetensors',
      weight_dtype: 'fp8_e4m3fn'
    },
    class_type: 'UNETLoader',
    _meta: {
      title: 'FaceDetailer UNet Loader (Qwen)'
    }
  },
  '76': {
    inputs: {
      clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
      type: 'qwen_image',
      device: 'default'
    },
    class_type: 'CLIPLoader',
    _meta: {
      title: 'FaceDetailer CLIP Loader (Qwen)'
    }
  },
  '77': {
    inputs: {
      model: ['75', 0],
      shift: 3.1
    },
    class_type: 'ModelSamplingAuraFlow',
    _meta: {
      title: 'FaceDetailer Model Sampling Aura Flow (Qwen)'
    }
  },
  '72': {
    inputs: {
      vae_name: 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'FaceDetailer VAE Loader (SDXL)'
    }
  },
  '78': {
    inputs: {
      vae_name: 'qwen_image_vae.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'FaceDetailer VAE Loader (Qwen)'
    }
  },
  '73': {
    inputs: {
      clip: ['71', 1],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'FaceDetailer CLIP Text Encode (Positive)'
    }
  },
  '74': {
    inputs: {
      clip: ['71', 1],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'FaceDetailer CLIP Text Encode (Negative)'
    }
  },
  '120': {
    inputs: {
      pixels: ['8', 0],
      vae: ['127', 0]
    },
    class_type: 'VAEEncode',
    _meta: {
      title: 'SDXL VAE Encode'
    }
  },
  '121': {
    inputs: {
      upscale_method: 'nearest-exact',
      width: 1248,
      height: 1824,
      crop: 'disabled',
      samples: ['120', 0]
    },
    class_type: 'LatentUpscale',
    _meta: {
      title: 'Latent Upscale'
    }
  },
  '122': {
    inputs: {
      seed: 12345,
      steps: 15,
      cfg: 4.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'simple',
      denoise: 0.5,
      model: ['123', 0],
      positive: ['124', 0],
      negative: ['125', 0],
      latent_image: ['121', 0]
    },
    class_type: 'KSampler',
    _meta: {
      title: 'KSampler (Upscale)'
    }
  },
  '123': {
    inputs: {
      ckpt_name: 'model.safetensors'
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: {
      title: 'Upscale Checkpoint Loader (SDXL)'
    }
  },
  '128': {
    inputs: {
      unet_name: 'qwen_image_fp8_e4m3fn.safetensors',
      weight_dtype: 'fp8_e4m3fn'
    },
    class_type: 'UNETLoader',
    _meta: {
      title: 'Upscale UNet Loader (Qwen)'
    }
  },
  '129': {
    inputs: {
      clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
      type: 'qwen_image',
      device: 'default'
    },
    class_type: 'CLIPLoader',
    _meta: {
      title: 'Upscale CLIP Loader (Qwen)'
    }
  },
  '130': {
    inputs: {
      model: ['128', 0],
      shift: 3.1
    },
    class_type: 'ModelSamplingAuraFlow',
    _meta: {
      title: 'Upscale Model Sampling Aura Flow (Qwen)'
    }
  },
  '124': {
    inputs: {
      clip: ['123', 1],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'Upscale CLIP Text Encode (Positive)'
    }
  },
  '125': {
    inputs: {
      clip: ['123', 1],
      text: ''
    },
    class_type: 'CLIPTextEncode',
    _meta: {
      title: 'Upscale CLIP Text Encode (Negative)'
    }
  },
  '126': {
    inputs: {
      samples: ['122', 0],
      vae: ['123', 2]
    },
    class_type: 'VAEDecode',
    _meta: {
      title: 'Upscale VAE Decode'
    }
  },
  '127': {
    inputs: {
      vae_name: 'fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Upscale VAE Loader (SDXL)'
    }
  },
  '131': {
    inputs: {
      vae_name: 'qwen_image_vae.safetensors'
    },
    class_type: 'VAELoader',
    _meta: {
      title: 'Upscale VAE Loader (Qwen)'
    }
  }
}
