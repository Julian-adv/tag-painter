// API for image storage and retrieval

import { json } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import extractChunks from 'png-chunks-extract'
import encodeChunks from 'png-chunks-encode'
import textChunk from 'png-chunk-text'
import { DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'
import { getTodayDate, getFormattedTime } from '$lib/utils/date'

// Type definitions for workflow and settings data
interface WorkflowNode {
  inputs?: {
    steps?: number
    sampler_name?: string
    scheduler?: string
    cfg?: number
    seed?: number
    noise_seed?: number
    width?: number
    height?: number
    ckpt_name?: string
  }
}

interface WorkflowData {
  [key: string]: WorkflowNode
}

interface PngChunk {
  name: string
  data: Uint8Array
}

// Replace characters outside Latin-1 with '?' to satisfy PNG tEXt constraints
function toLatin1(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    out += code <= 0xff ? input[i] : '?'
  }
  return out
}

export async function GET({ url }) {
  try {
    const imagePath = url.searchParams.get('path')
    const metadataOnly = url.searchParams.get('metadata') === 'true'

    if (!imagePath) {
      return json({ error: 'Image path is required' }, { status: 400 })
    }

    // Use the full path directly
    const fullPath = path.resolve(imagePath)

    // Security: ensure the path is a real file and contains no directory traversal
    if (imagePath.includes('..') || !path.isAbsolute(imagePath)) {
      return json({ error: 'Invalid image path' }, { status: 403 })
    }

    // Check if file exists
    try {
      await fs.access(fullPath)
    } catch {
      return json({ error: 'Image not found' }, { status: 404 })
    }

    // If only metadata is requested, return JSON with metadata
    if (metadataOnly) {
      // Extract metadata using Sharp
      const metadata = await sharp(fullPath).metadata()

      return json({
        success: true,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: metadata.size,
          density: metadata.density,
          channels: metadata.channels,
          depth: metadata.depth,
          hasAlpha: metadata.hasAlpha,
          // Extract parameters from PNG text chunks (WebUI style)
          parameters: await extractPngParameters(fullPath)
        }
      })
    }

    // Otherwise, serve the image file
    const imageBuffer = await fs.readFile(fullPath)
    const fileExtension = path.extname(fullPath).toLowerCase()

    // Determine content type
    let contentType = 'application/octet-stream'
    if (fileExtension === '.png') {
      contentType = 'image/png'
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      contentType = 'image/jpeg'
    } else if (fileExtension === '.webp') {
      contentType = 'image/webp'
    }

    // Cast Buffer to a Uint8Array to satisfy BodyInit type
    return new Response(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
      }
    })
  } catch (error) {
    console.error('Error serving image:', error)
    return json({ error: 'Failed to serve image' }, { status: 500 })
  }
}

export async function POST({ request }) {
  try {
    const contentType = request.headers.get('content-type')

    let imageBuffer: Buffer
    let promptText = ''
    let outputDirectory = DEFAULT_OUTPUT_DIRECTORY
    let workflowData: WorkflowData | null = null
    const prompts: {
      all: string
      zone1: string
      zone2: string
      negative: string
    } = { all: '', zone1: '', zone2: '', negative: '' }
    let seed = 0

    if (contentType?.includes('multipart/form-data')) {
      // Handle form data with prompt metadata and output directory
      const formData = await request.formData()
      const imageFile = formData.get('image') as File

      // Extract prompt data
      prompts.all = (formData.get('allPrompt') as string) || ''
      prompts.zone1 = (formData.get('zone1Prompt') as string) || ''
      prompts.zone2 = (formData.get('zone2Prompt') as string) || ''
      prompts.negative = (formData.get('negativePrompt') as string) || ''
      seed = parseInt((formData.get('seed') as string) || '0', 10)

      const outputDir = formData.get('outputDirectory') as string
      const workflow = formData.get('workflow') as string

      if (imageFile) {
        imageBuffer = Buffer.from(await imageFile.arrayBuffer())

        // Construct main prompt text from non-empty prompt parts
        const promptParts = [prompts.all, prompts.zone1, prompts.zone2].filter(
          (p) => p.trim().length > 0
        )
        promptText = promptParts.join(' [SEP] ')

        outputDirectory = outputDir || DEFAULT_OUTPUT_DIRECTORY

        // Parse workflow data
        try {
          workflowData = workflow ? JSON.parse(workflow) : null
        } catch (e) {
          console.warn('Failed to parse workflow data:', e)
        }
      } else {
        throw new Error('No image file found in form data')
      }
    } else {
      // Handle direct blob upload (backward compatibility)
      const imageBlob = await request.blob()
      imageBuffer = Buffer.from(await imageBlob.arrayBuffer())
    }

    // Compute effective output directory with fallbacks
    function getEffectiveOutputDir(dir: string): string {
      const trimmed = (dir || '').trim()
      if (!trimmed) {
        return DEFAULT_OUTPUT_DIRECTORY
      }
      return trimmed
    }

    const effectiveDir = getEffectiveOutputDir(outputDirectory)
    const baseOutputDir = path.isAbsolute(effectiveDir)
      ? effectiveDir
      : path.resolve(process.cwd(), effectiveDir)
    const todayFolder = getTodayDate()
    const finalOutputDir = path.join(baseOutputDir, todayFolder)
    await fs.mkdir(finalOutputDir, { recursive: true })

    const fileName = `${getFormattedTime()}.png`
    const filePath = path.join(finalOutputDir, fileName)

    // Add metadata to PNG if prompt is provided
    if (promptText) {
      // Extract parameters from workflow and settings
      const steps = workflowData?.['45']?.inputs?.steps || 28
      const sampler = workflowData?.['15']?.inputs?.sampler_name || 'euler_ancestral'
      // Prefer scheduler from the main sampler, fall back to KSampler used by inpainting
      const scheduler =
        workflowData?.['45']?.inputs?.scheduler || workflowData?.['10']?.inputs?.scheduler || 'simple'
      const cfg = workflowData?.['14']?.inputs?.cfg || 5
      const workflowSeed = workflowData?.['14']?.inputs?.noise_seed || seed
      const width = workflowData?.['16']?.inputs?.width || 832
      const height = workflowData?.['16']?.inputs?.height || 1216
      const model = workflowData?.['11']?.inputs?.ckpt_name || 'unknown'

      // Convert scheduler to proper format
      const schedulerMap: Record<string, string> = {
        simple: 'Simple',
        sgm_uniform: 'SGM Uniform',
        karras: 'Karras',
        exponential: 'Exponential',
        ddim_uniform: 'DDIM Uniform',
        beta: 'Beta',
        normal: 'Normal',
        linear_quadratic: 'Linear Quadratic',
        kl_optimal: 'KL Optimal'
      }
      const scheduleType = schedulerMap[scheduler] || 'Simple'

      // Convert sampler name to proper format
      const samplerMap: Record<string, string> = {
        euler_ancestral: 'Euler a',
        dpmpp_2m_sde: 'DPM++ 2M SDE',
        dpmpp_2m: 'DPM++ 2M',
        euler: 'Euler',
        heun: 'Heun',
        lms: 'LMS'
      }
      const samplerName = samplerMap[sampler] || sampler

      // Extract model name without extension
      const modelName = model.replace(/\.(safetensors|ckpt)$/, '')

      // Format prompt in WebUI style with parameters
      const zoneLines = []
      if (prompts.all) zoneLines.push(`All: ${prompts.all}`)
      if (prompts.zone1) zoneLines.push(`First Zone: ${prompts.zone1}`)
      if (prompts.zone2) zoneLines.push(`Second Zone: ${prompts.zone2}`)

      const parametersText = `${promptText}
${zoneLines.join('\n')}
Negative prompt: ${prompts.negative}
Steps: ${steps}, Sampler: ${samplerName}, Schedule type: ${scheduleType}, CFG scale: ${cfg}, Seed: ${workflowSeed}, Size: ${width}x${height}, Model: ${modelName}`

      try {
        // First process the image with Sharp
        const processedBuffer = await sharp(imageBuffer)
          .png({ compressionLevel: 6, palette: false })
          .toBuffer()

        // Extract PNG chunks
        const chunks = extractChunks(processedBuffer)

        // Create a text chunk with parameters (WebUI style)
        // PNG tEXt must be Latin-1; replace non-Latin-1 chars to avoid errors
        const parametersChunk = textChunk.encode('parameters', toLatin1(parametersText))

        // Insert the text chunk before the IEND chunk
        const iendIndex = chunks.findIndex((chunk: PngChunk) => chunk.name === 'IEND')
        if (iendIndex > -1) {
          chunks.splice(iendIndex, 0, parametersChunk)
        } else {
          chunks.push(parametersChunk)
        }

        // Encode chunks back to PNG buffer
        const finalBuffer = Buffer.from(encodeChunks(chunks))
        await fs.writeFile(filePath, finalBuffer)
      } catch (e) {
        console.warn('Metadata embed failed; saving original buffer. Reason:', e)
        await fs.writeFile(filePath, imageBuffer)
      }
    } else {
      // Save without metadata if no prompt provided
      await fs.writeFile(filePath, imageBuffer)
    }

    return json({ success: true, filePath, prompt: promptText })
  } catch (error) {
    console.error('Error saving image:', error)
    return json({ success: false, error: 'Failed to save image' }, { status: 500 })
  }
}

// Helper function to extract PNG parameters from text chunks
async function extractPngParameters(filePath: string): Promise<string | null> {
  try {
    const imageBuffer = await fs.readFile(filePath)
    const chunks = extractChunks(imageBuffer)

    // Look for text chunks containing parameters
    for (const chunk of chunks) {
      if (chunk.name === 'tEXt') {
        try {
          const decoded = textChunk.decode(chunk.data)
          if (decoded.keyword === 'parameters') {
            return decoded.text
          }
        } catch {
          // Skip invalid text chunks
        }
      }
    }
    return null
  } catch {
    return null
  }
}
