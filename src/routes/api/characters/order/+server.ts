import type { RequestHandler } from '@sveltejs/kit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const CHAR_DIR = join(process.cwd(), 'data', 'character')
const ORDER_PATH = join(CHAR_DIR, 'order.json')

export const GET: RequestHandler = async () => {
  try {
    const text = await readFile(ORDER_PATH, 'utf-8')
    return new Response(text, { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ order: [] }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json()
    const order = Array.isArray(body?.order) ? (body.order as string[]) : []
    await mkdir(CHAR_DIR, { recursive: true })
    await writeFile(ORDER_PATH, JSON.stringify({ order }, null, 2), 'utf-8')
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to save order' }), { status: 500 })
  }
}

