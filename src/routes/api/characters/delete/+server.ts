import type { RequestHandler } from '@sveltejs/kit'
import { unlink, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CHAR_DIR = join(process.cwd(), 'data', 'character')

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json()
    const filename = (body?.filename || '').toString()
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return new Response(JSON.stringify({ error: 'Invalid filename' }), { status: 400 })
    }
    const full = join(CHAR_DIR, filename)
    await unlink(full)
    // also remove from order.json if present
    try {
      const orderPath = join(CHAR_DIR, 'order.json')
      const text = await readFile(orderPath, 'utf-8')
      const obj = JSON.parse(text)
      if (Array.isArray(obj?.order)) {
        obj.order = obj.order.filter((f: string) => f !== filename)
        await writeFile(orderPath, JSON.stringify(obj, null, 2), 'utf-8')
      }
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to delete character' }), { status: 500 })
  }
}

