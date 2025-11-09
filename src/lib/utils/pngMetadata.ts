// Client-side PNG metadata extraction utility
// Uses png-chunks-extract to read metadata from PNG files in the browser

import extractChunks from 'png-chunks-extract'

interface PngChunk {
  name: string
  data: Uint8Array
}

// Helper function to decode iTXt chunk
function decodeITXtChunk(data: Uint8Array): { keyword: string; text: string } | null {
  try {
    const buffer = new Uint8Array(data)
    let offset = 0

    // Read keyword (null-terminated)
    const keywordEnd = buffer.indexOf(0, offset)
    if (keywordEnd === -1) return null
    const keyword = new TextDecoder('latin1').decode(buffer.slice(offset, keywordEnd))
    offset = keywordEnd + 1

    // Skip compression flag, compression method
    offset += 2

    // Read language tag (null-terminated)
    const langEnd = buffer.indexOf(0, offset)
    if (langEnd === -1) return null
    offset = langEnd + 1

    // Read translated keyword (null-terminated)
    const transEnd = buffer.indexOf(0, offset)
    if (transEnd === -1) return null
    offset = transEnd + 1

    // Read text (UTF-8)
    const text = new TextDecoder('utf8').decode(buffer.slice(offset))

    return { keyword, text }
  } catch {
    return null
  }
}

// Helper function to decode tEXt chunk
function decodeTEXtChunk(data: Uint8Array): { keyword: string; text: string } | null {
  try {
    const buffer = new Uint8Array(data)

    // Read keyword (null-terminated)
    const keywordEnd = buffer.indexOf(0)
    if (keywordEnd === -1) return null
    const keyword = new TextDecoder('latin1').decode(buffer.slice(0, keywordEnd))

    // Read text (latin1)
    const text = new TextDecoder('latin1').decode(buffer.slice(keywordEnd + 1))

    return { keyword, text }
  } catch {
    return null
  }
}

/**
 * Extract PNG parameters metadata from a PNG file
 * @param file - PNG file to read metadata from
 * @returns Parameters text if found, null otherwise
 */
export async function extractPngParameters(file: File): Promise<string | null> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Extract PNG chunks
    const chunks = extractChunks(uint8Array) as PngChunk[]

    // Collect all text metadata
    const allMetadata: Record<string, string> = {}

    // Look for text chunks containing metadata
    for (const chunk of chunks) {
      // First check iTXt (UTF-8 support)
      if (chunk.name === 'iTXt') {
        const decoded = decodeITXtChunk(chunk.data)
        if (decoded) {
          allMetadata[decoded.keyword] = decoded.text
        }
      }
      // Fallback to tEXt for backward compatibility
      else if (chunk.name === 'tEXt') {
        const decoded = decodeTEXtChunk(chunk.data)
        if (decoded) {
          allMetadata[decoded.keyword] = decoded.text
        }
      }
    }

    // Priority order: parameters (our format), prompt (ComfyUI format), workflow
    if (allMetadata['parameters']) {
      return allMetadata['parameters']
    }

    // ComfyUI stores workflow in 'prompt' and 'workflow' keys
    if (allMetadata['prompt']) {
      // Try to format ComfyUI prompt data nicely
      try {
        const promptData = JSON.parse(allMetadata['prompt'])
        return `ComfyUI Workflow Metadata:\n\n${JSON.stringify(promptData, null, 2)}`
      } catch {
        return `ComfyUI Prompt:\n${allMetadata['prompt']}`
      }
    }

    if (allMetadata['workflow']) {
      try {
        const workflowData = JSON.parse(allMetadata['workflow'])
        return `ComfyUI Workflow:\n\n${JSON.stringify(workflowData, null, 2)}`
      } catch {
        return `ComfyUI Workflow:\n${allMetadata['workflow']}`
      }
    }

    // Return any other metadata found
    const otherKeys = Object.keys(allMetadata)
    if (otherKeys.length > 0) {
      const lines = otherKeys.map(key => `${key}:\n${allMetadata[key]}`)
      return lines.join('\n\n')
    }

    return null
  } catch (error) {
    console.error('Failed to extract PNG metadata:', error)
    return null
  }
}

/**
 * Create an object URL from a File for display
 * @param file - File to create URL from
 * @returns Object URL string
 */
export function createImageObjectUrl(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Revoke an object URL to free memory
 * @param url - Object URL to revoke
 */
export function revokeImageObjectUrl(url: string): void {
  URL.revokeObjectURL(url)
}
