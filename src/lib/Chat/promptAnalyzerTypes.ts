import type { PromptAnalysis } from '$lib/types'

export interface SubNodeOption {
  id: string
  name: string
  path: string
}

export interface PendingAdd {
  field: keyof PromptAnalysis
  value: string
  nodeName: string
  options: SubNodeOption[]
}

export interface SlotMapping {
  slot: string
  original: string
}

export interface PendingSlotAdd {
  mapping: SlotMapping
  options: SubNodeOption[]
}

export interface GeneralizeResult {
  prompt: string
  mappings: SlotMapping[]
}

export const GEMINI_MODEL_ID = 'gemini-2.5-flash'
export const DEFAULT_OPENROUTER_MODEL_ID = 'tngtech/deepseek-r1t2-chimera:free'

export const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    subject: {
      type: 'STRING',
      description: 'The main subject or character (e.g., 1girl, 2girls, 1boy, couple).'
    },
    pose: {
      type: 'STRING',
      description: 'The specific physical pose or action of the subject (excluding facial expression).'
    },
    expression: {
      type: 'STRING',
      description: 'The facial expression, mood, or emotional state of the subject.'
    },
    composition: {
      type: 'STRING',
      description: 'The camera angle, shot type (e.g., close up, wide), and framing.'
    },
    background: {
      type: 'STRING',
      description: 'The environment, setting, and background details.'
    },
    lighting: {
      type: 'STRING',
      description: 'The lighting conditions, color of light, and shadows.'
    },
    hair: {
      type: 'STRING',
      description:
        'Hair style (shape, length, texture) and color combined (e.g., long wavy blonde hair, short pink bob).'
    },
    eyes: {
      type: 'STRING',
      description: 'Eye color and specific eye features or gaze.'
    },
    outfit: {
      type: 'STRING',
      description: 'Description of the main outfit (combining top and bottom, or dress/jumpsuit).'
    },
    legwear: {
      type: 'STRING',
      description: 'Description of legwear or stockings.'
    },
    footwear: {
      type: 'STRING',
      description: 'Description of the footwear.'
    },
    accessories: {
      type: 'STRING',
      description: 'Jewelry, hats, glasses, or other portable items.'
    }
  },
  required: [
    'subject',
    'pose',
    'expression',
    'composition',
    'background',
    'lighting',
    'hair',
    'eyes',
    'outfit',
    'legwear',
    'footwear',
    'accessories'
  ]
}

export const FIELD_LABELS: Record<keyof PromptAnalysis, string> = {
  subject: 'Subject',
  pose: 'Pose',
  expression: 'Expression',
  composition: 'Composition',
  background: 'Background',
  lighting: 'Lighting',
  hair: 'Hair',
  eyes: 'Eyes',
  outfit: 'Outfit',
  legwear: 'Legwear',
  footwear: 'Footwear',
  accessories: 'Accessories'
}

export const FIELD_TO_YAML_NODE: Record<keyof PromptAnalysis, string | string[]> = {
  subject: 'subject',
  pose: ['pose', 'pose2', 'pose3', 'pose4', 'pose5'],
  expression: 'expression',
  composition: 'composition',
  background: 'background',
  lighting: 'lighting',
  hair: ['hair_style', 'hair_color', 'hair'],
  eyes: 'eyes',
  outfit: ['clothing_style_with_stockings', 'clothing_style_without_stockings', 'clothing'],
  legwear: 'leg_wear',
  footwear: 'shoes',
  accessories: 'accessories'
}

export const SLOT_TO_YAML_NODE: Record<string, string | string[]> = {
  __subject__: 'subject',
  __eyes__: 'eyes',
  __hair__: ['hair_style', 'hair_color', 'hair'],
  __clothing__: ['clothing_style_with_stockings', 'clothing_style_without_stockings', 'clothing'],
  __skin__: 'skin'
}

export const FIELD_ORDER: (keyof PromptAnalysis)[] = [
  'subject',
  'pose',
  'expression',
  'composition',
  'background',
  'lighting',
  'hair',
  'eyes',
  'outfit',
  'legwear',
  'footwear',
  'accessories'
]

export const ANALYSIS_PROMPT = `Analyze the following image generation prompt and extract the visual elements.
If the prompt is in Chinese, translate it to English first before extracting.
Separate physical 'pose' from 'expression'.
If an element is not mentioned, provide "N/A" or "Not specified".`

export const SYSTEM_PROMPT =
  'You are a professional prompt engineer. Deconstruct complex prompts into core visual components.'

export const GENERALIZE_PROMPT = `Given an image generation prompt, replace specific descriptive elements with placeholder slots and report what was replaced.

Replace the following elements with their corresponding placeholders:
1. Eye color with the word "eyes" → __eyes__
   Example: "natural dark eyes" → "__eyes__"
   Do NOT replace eye shape or gaze descriptions separately.
2. Hair descriptions (style, color, length, texture) → __hair__
3. Subject/person descriptions (age, gender, ethnicity, beauty descriptors) → __subject__
4. Clothing/outfit descriptions (all clothing items, accessories worn on body) → __clothing__
   Keep the word "wearing" before __clothing__ if present.
5. Skin descriptions (texture, tone, condition) → __skin__
   Example: "clear smooth skin" → "__skin__"

Important rules:
- Only replace elements that are clearly present in the prompt
- Keep all other descriptive elements (pose, background, lighting, composition, etc.) unchanged
- Maintain the original sentence structure and flow as much as possible
- If the prompt is in Chinese, first translate it to English, then apply the replacements

Prompt to generalize:`

export const GENERALIZE_SYSTEM_PROMPT =
  'You are a prompt template generator. Your task is to replace specific visual elements with placeholder slots while preserving the overall structure of the prompt.'

export const GENERALIZE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    prompt: {
      type: 'STRING',
      description:
        'The generalized prompt with placeholders (__subject__, __eyes__, __hair__, __clothing__, __skin__) replacing the original descriptions.'
    },
    mappings: {
      type: 'ARRAY',
      description: 'List of replacements made. Only include slots that were actually used.',
      items: {
        type: 'OBJECT',
        properties: {
          slot: {
            type: 'STRING',
            description:
              'The placeholder slot name (e.g., __subject__, __eyes__, __hair__, __clothing__, __skin__)'
          },
          original: {
            type: 'STRING',
            description: 'The original text that was replaced by this slot'
          }
        },
        required: ['slot', 'original']
      }
    }
  },
  required: ['prompt', 'mappings']
}

export const GENERALIZE_JSON_INSTRUCTION = `
Respond with a JSON object containing:
- "prompt": The generalized prompt with placeholders
- "mappings": Array of {"slot": "__xxx__", "original": "replaced text"} for each replacement made

Example response:
{"prompt": "A photo of __subject__ with __hair__ and __skin__", "mappings": [{"slot": "__subject__", "original": "a young woman"}, {"slot": "__hair__", "original": "long black hair"}, {"slot": "__skin__", "original": "clear smooth skin"}]}`
