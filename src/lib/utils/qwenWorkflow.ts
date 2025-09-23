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
      latent_image: ['58', 0]
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
  '58': {
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
  }
}
