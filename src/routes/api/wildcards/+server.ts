import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const dataDir = path.resolve(process.cwd(), 'data')
const filePath = path.join(dataDir, 'wildcards.yaml')

async function ensureDir() {
  try {
    await fs.mkdir(dataDir, { recursive: true })
  } catch (error) {
    console.error('Error creating data directory:', error)
  }
}

export async function POST({ request }: RequestEvent) {
  await ensureDir()
  try {
    const text = await request.text()
    await fs.writeFile(filePath, text, 'utf-8')
    return json({ success: true })
  } catch (error) {
    console.error('Error writing wildcards.yaml:', error)
    return json({ success: false, error: 'Failed to save wildcards.yaml' }, { status: 500 })
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}

export async function GET() {
  await ensureDir()
  try {
    const text = await fs.readFile(filePath, 'utf-8')
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return new Response('', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    console.error('Error reading wildcards.yaml:', error)
    return json({ error: 'Failed to read wildcards.yaml' }, { status: 500 })
  }
}
