import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const dataDir = path.resolve(process.cwd(), 'data')

function getWildcardsFilePath(filename?: string): string {
  const defaultFile = 'wildcards.yaml'
  return path.join(dataDir, filename || defaultFile)
}

async function ensureDir() {
  try {
    await fs.mkdir(dataDir, { recursive: true })
  } catch (error) {
    console.error('Error creating data directory:', error)
  }
}

export async function POST({ request, url }: RequestEvent) {
  await ensureDir()
  try {
    const filename = url.searchParams.get('filename') || undefined
    const filePath = getWildcardsFilePath(filename)
    const text = await request.text()
    await fs.writeFile(filePath, text, 'utf-8')
    return json({ success: true })
  } catch (error) {
    const fileName = url.searchParams.get('filename') || 'wildcards.yaml'
    console.error(`Error writing ${fileName}:`, error)
    return json({ success: false, error: `Failed to save ${fileName}` }, { status: 500 })
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}

export async function GET({ url }) {
  await ensureDir()
  const filename = url.searchParams.get('filename') || undefined
  try {
    const filePath = getWildcardsFilePath(filename)
    const text = await fs.readFile(filePath, 'utf-8')
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      // If a custom filename was specified but not found, return 404
      if (filename) {
        return json({ error: `Wildcards file not found: ${filename}` }, { status: 404 })
      }
      // For default file, return empty content to allow starting fresh
      return new Response('', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    const fileName = filename || 'wildcards.yaml'
    console.error(`Error reading ${fileName}:`, error)
    return json({ error: `Failed to read ${fileName}` }, { status: 500 })
  }
}
