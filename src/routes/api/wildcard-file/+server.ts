import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const dataDir = path.resolve(process.cwd(), 'data')

function sanitizeFilename(name: string): string {
  // Allow only basename to avoid path traversal
  const base = path.basename(name)
  // Reject anything that resolves to empty or attempts directory tricks
  return base
}

export async function GET({ url }: RequestEvent) {
  try {
    const name = url.searchParams.get('name') || ''
    const safeName = sanitizeFilename(name)
    if (!safeName) return json({ error: 'Invalid filename' }, { status: 400 })

    const filePath = path.join(dataDir, safeName)
    const content = await fs.readFile(filePath, 'utf-8')
    return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch {
    return json({ error: 'Failed to read file' }, { status: 404 })
  }
}
