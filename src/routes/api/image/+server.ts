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

    return new Response(imageBuffer, {
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
    let categorizedPrompts: Record<string, string> = {}

    if (contentType?.includes('multipart/form-data')) {
      // Handle form data with prompt metadata and output directory
      const formData = await request.formData()
      const imageFile = formData.get('image') as File
      // Extract all category data dynamically
      const categoryData: Record<string, string> = {}
      for (const [key, value] of formData.entries()) {
        if (key !== 'image' && key !== 'outputDirectory' && key !== 'workflow') {
          categoryData[key] = value as string
        }
      }
      const outputDir = formData.get('outputDirectory') as string
      const workflow = formData.get('workflow') as string

      if (imageFile) {
        imageBuffer = Buffer.from(await imageFile.arrayBuffer())
        // Reconstruct full prompt for metadata (exclude negative category)
        const promptParts = Object.entries(categoryData)
          .filter(([key, value]) => key !== 'negative' && Boolean(value))
          .map(([, value]) => value)
        promptText = promptParts.join(', ')
        
        // Store categorized prompts for structured metadata
        categorizedPrompts = categoryData
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

    const baseOutputDir = path.resolve(process.cwd(), outputDirectory)
    const todayFolder = getTodayDate()
    const finalOutputDir = path.join(baseOutputDir, todayFolder)
    await fs.mkdir(finalOutputDir, { recursive: true })

    const fileName = `${getFormattedTime()}.png`
    const filePath = path.join(finalOutputDir, fileName)

    // Add metadata to PNG if prompt is provided
    if (promptText) {
      // Extract parameters from workflow and settings
      const steps = workflowData?.['8']?.inputs?.steps || 28
      const sampler = workflowData?.['8']?.inputs?.sampler_name || 'euler_ancestral'
      const scheduler = workflowData?.['8']?.inputs?.scheduler || 'simple'
      const cfg = workflowData?.['8']?.inputs?.cfg || 5
      const seed = workflowData?.['8']?.inputs?.seed || Math.floor(Math.random() * 10000000000)
      const width = workflowData?.['9']?.inputs?.width || 832
      const height = workflowData?.['9']?.inputs?.height || 1216
      const model = workflowData?.['10']?.inputs?.ckpt_name || 'unknown'

      // Convert scheduler to proper format
      const schedulerMap: Record<string, string> = {
        'simple': 'Simple',
        'karras': 'Karras',
        'exponential': 'Exponential',
        'sgm_uniform': 'SGM Uniform'
      }
      const scheduleType = schedulerMap[scheduler] || 'Simple'

      // Convert sampler name to proper format
      const samplerMap: Record<string, string> = {
        'euler_ancestral': 'Euler a',
        'dpmpp_2m_sde': 'DPM++ 2M SDE',
        'dpmpp_2m': 'DPM++ 2M',
        'euler': 'Euler',
        'heun': 'Heun',
        'lms': 'LMS'
      }
      const samplerName = samplerMap[sampler] || sampler

      // Extract model name without extension
      const modelName = model.replace(/\.(safetensors|ckpt)$/, '')

      // Format prompt in WebUI style with parameters
      const categoryLines = Object.entries(categorizedPrompts)
        .map(([key, value]) => {
          if (key === 'negative') {
            return `Negative prompt: ${value}`
          }
          return `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`
        })
        .join('\n')
      
      const parametersText = `${promptText}
${categoryLines}
Steps: ${steps}, Sampler: ${samplerName}, Schedule type: ${scheduleType}, CFG scale: ${cfg}, Seed: ${seed}, Size: ${width}x${height}, Model: ${modelName}`

      // First process the image with Sharp
      const processedBuffer = await sharp(imageBuffer)
        .png({
          compressionLevel: 6,
          palette: false
        })
        .toBuffer()

      // Extract PNG chunks
      const chunks = extractChunks(processedBuffer)

      // Create a text chunk with parameters (WebUI style)
      const parametersChunk = textChunk.encode('parameters', parametersText)

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
