import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const dataDir = path.resolve(process.cwd(), 'data')

// File-level mutex to prevent concurrent writes
const fileLocks = new Map<string, Promise<void>>()

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this file
  const existingLock = fileLocks.get(filePath)

  let releaseLock: () => void
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })

  // Set the new lock before waiting
  fileLocks.set(filePath, newLock)

  try {
    // Wait for previous operation to complete
    if (existingLock) {
      await existingLock
    }
    // Execute the actual operation
    return await fn()
  } finally {
    releaseLock!()
    // Clean up if this is still the current lock
    if (fileLocks.get(filePath) === newLock) {
      fileLocks.delete(filePath)
    }
  }
}

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

async function backupFileIfExists(filePath: string) {
  try {
    await fs.stat(filePath)
  } catch (err) {
    return
  }
  const backupPath = `${filePath}.bak`
  try {
    await fs.copyFile(filePath, backupPath)
  } catch (error) {
    console.warn(`Failed to create backup for ${filePath}:`, error)
  }
}

export async function POST({ request, url }: RequestEvent) {
  await ensureDir()
  const filename = url.searchParams.get('filename') || undefined
  const filePath = getWildcardsFilePath(filename)

  // Use file lock to prevent concurrent writes
  return withFileLock(filePath, async () => {
    try {
      const text = await request.text()
      const trimmed = text.trim()
      if (trimmed === '{}' || trimmed === '{ }') {
        return json({ success: false, error: 'Rejected empty wildcards content.' }, { status: 400 })
      }
      await backupFileIfExists(filePath)
      await fs.writeFile(filePath, text, 'utf-8')
      return json({ success: true })
    } catch (error) {
      const fileName = filename || 'wildcards.yaml'
      console.error(`Error writing ${fileName}:`, error)
      return json({ success: false, error: `Failed to save ${fileName}` }, { status: 500 })
    }
  })
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}

export async function GET({ url }) {
  await ensureDir()
  const filename = url.searchParams.get('filename') || undefined
  const filePath = getWildcardsFilePath(filename)
  const createIfMissing = url.searchParams.get('createIfMissing') === 'true'

  // Use file lock to ensure reads wait for any pending writes
  return withFileLock(filePath, async () => {
    try {
      const text = await fs.readFile(filePath, 'utf-8')
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        // If createIfMissing flag is set, create the file with minimal content
        if (createIfMissing && filename) {
          const minimalContent = getMinimalWildcardsContent()
          await fs.writeFile(filePath, minimalContent, 'utf-8')
          return new Response(minimalContent, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
        }
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
  })
}

function getMinimalWildcardsContent(): string {
  return `all:
  - ""
zone1:
  - ""
zone2:
  - ""
negative:
  - ""
inpainting:
  - ""
`
}
