import type { RequestHandler } from '@sveltejs/kit'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readCharxJpegCompat } from '$lib/charx/charx'

const CHAR_DIR = join(process.cwd(), 'data', 'character')

function isCharxJpegFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.jpeg') || lower.endsWith('.jpg')
}

export const GET: RequestHandler = async () => {
  try {
    const entries = await readdir(CHAR_DIR)
    const files = entries.filter(isCharxJpegFile)
    const list = [] as Array<{
      filename: string
      path: string
      name: string
      size: number
    }>

    for (const f of files) {
      const full = join(CHAR_DIR, f)
      let name = f
      try {
        const buf = new Uint8Array(await readFile(full))
        const parsed = readCharxJpegCompat(buf)
        const cardText = parsed.getText('card.json')
        if (cardText) {
          const card = JSON.parse(cardText)
          name = card?.data?.name || name
        }
      } catch {
        // ignore parsing errors; leave name as filename
      }
      const st = await stat(full)
      list.push({ filename: f, path: `data/character/${f}`, name, size: st.size })
    }

    // Load order.json if present to sort
    try {
      const orderText = await readFile(join(CHAR_DIR, 'order.json'), 'utf-8')
      const order: string[] = JSON.parse(orderText)
      list.sort((a, b) => {
        const ia = order.indexOf(a.filename)
        const ib = order.indexOf(b.filename)
        const aa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia
        const bb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib
        return aa - bb || a.name.localeCompare(b.name)
      })
    } catch {
      // no order file; keep default
    }

    return new Response(JSON.stringify({ characters: list }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to list characters' }), { status: 500 })
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { filename } = await request.json()
    if (!filename) {
      return new Response(JSON.stringify({ error: 'Filename required' }), { status: 400 })
    }

    const full = join(CHAR_DIR, filename)
    const buf = new Uint8Array(await readFile(full))
    const parsed = readCharxJpegCompat(buf)
    console.log('parsed charx jpeg:', parsed)
    const cardText = parsed.getText('card.json')

    if (!cardText) {
      return new Response(JSON.stringify({ error: 'No card.json found' }), { status: 404 })
    }

    const card = JSON.parse(cardText)

    return new Response(JSON.stringify({ card }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('Failed to read character info:', e)
    return new Response(JSON.stringify({ error: 'Failed to read character info' }), {
      status: 500
    })
  }
}

