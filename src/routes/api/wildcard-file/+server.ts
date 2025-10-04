import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const dataDir = path.resolve(process.cwd(), 'data')

function sanitizePath(name: string): string {
  // Normalize path separators
  const normalized = name.replace(/\\/g, '/')

  // Check for path traversal attempts
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return ''
  }

  // Resolve to ensure it stays within data directory
  const resolved = path.resolve(dataDir, normalized)
  if (!resolved.startsWith(dataDir)) {
    return ''
  }

  return normalized
}

export async function GET({ url }: RequestEvent) {
  try {
    const name = url.searchParams.get('name') || ''
    const safePath = sanitizePath(name)
    if (!safePath) return json({ error: 'Invalid filename' }, { status: 400 })

    const filePath = path.join(dataDir, safePath)
    const content = await fs.readFile(filePath, 'utf-8')
    return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch {
    return json({ error: 'Failed to read file' }, { status: 404 })
  }
}
