import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'
import { getWildcardsFileName } from '$lib/utils/wildcards'

const dataDir = path.resolve(process.cwd(), 'data')

function getWildcardsFilePath(modelType?: string): string {
  return path.join(dataDir, getWildcardsFileName(modelType))
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
    const modelType = url.searchParams.get('modelType') || undefined
    const filePath = getWildcardsFilePath(modelType)
    const text = await request.text()
    await fs.writeFile(filePath, text, 'utf-8')
    return json({ success: true })
  } catch (error) {
    const fileName = getWildcardsFileName(url.searchParams.get('modelType') || undefined)
    console.error(`Error writing ${fileName}:`, error)
    return json({ success: false, error: `Failed to save ${fileName}` }, { status: 500 })
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}

export async function GET({ url }) {
  await ensureDir()
  try {
    const modelType = url.searchParams.get('modelType') || undefined
    const filePath = getWildcardsFilePath(modelType)
    const text = await fs.readFile(filePath, 'utf-8')
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return new Response('', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    const fileName = getWildcardsFileName(url.searchParams.get('modelType') || undefined)
    console.error(`Error reading ${fileName}:`, error)
    return json({ error: `Failed to read ${fileName}` }, { status: 500 })
  }
}
