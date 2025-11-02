import type { RequestHandler } from '@sveltejs/kit'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readCharxJpegCompat, writeCharxJpegWithCard } from '$lib/charx/charx'

const CHAR_DIR = join(process.cwd(), 'data', 'character')

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { filename, card } = await request.json()
    if (!filename || !card) {
      return new Response(JSON.stringify({ error: 'Filename and card required' }), {
        status: 400
      })
    }

    const full = join(CHAR_DIR, filename)
    const buf = new Uint8Array(await readFile(full))
    const parsed = readCharxJpegCompat(buf)

    // Extract the original JPEG image (before the ZIP archive)
    // Find the end of JPEG marker (FFD9)
    let jpegEnd = -1
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd9) {
        jpegEnd = i + 2
        break
      }
    }

    if (jpegEnd === -1) {
      return new Response(JSON.stringify({ error: 'Invalid JPEG format' }), { status: 400 })
    }

    const baseJpeg = buf.slice(0, jpegEnd)

    // Collect all existing files except card.json
    const assets: { path: string; data: Uint8Array }[] = []
    for (const file of parsed.files) {
      if (file.name !== 'card.json') {
        assets.push({ path: file.name, data: file.data })
      }
    }

    // Write new CHARX-JPEG with updated card
    const newCharx = writeCharxJpegWithCard(baseJpeg, card, assets)
    await writeFile(full, newCharx)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('Failed to update character:', e)
    return new Response(JSON.stringify({ error: 'Failed to update character' }), {
      status: 500
    })
  }
}
