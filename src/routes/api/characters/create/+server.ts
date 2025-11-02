import type { RequestHandler } from '@sveltejs/kit'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeCharxJpegWithCard } from '$lib/charx/charx'

const CHAR_DIR = join(process.cwd(), 'data', 'character')

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 64)
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json()
    const name = (body?.name || '').toString().trim()
    const jpegBase64 = (body?.jpegBase64 || '').toString()
    if (!name || !jpegBase64) {
      return new Response(JSON.stringify({ error: 'name and jpegBase64 are required' }), {
        status: 400
      })
    }

    const baseJpeg = Uint8Array.from(Buffer.from(jpegBase64, 'base64'))

    const card = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name,
        description: '',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        character_book: { extensions: {}, entries: [] },
        tags: [],
        creator: '',
        character_version: '',
        extensions: { risuai: { viewScreen: 'none', utilityBot: false } }
      }
    }

    const outBytes = writeCharxJpegWithCard(baseJpeg, card)
    await mkdir(CHAR_DIR, { recursive: true })
    const filename = `${sanitizeName(name)}_${Date.now()}.jpeg`
    const full = join(CHAR_DIR, filename)
    await writeFile(full, outBytes)
    return new Response(JSON.stringify({ ok: true, filename }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to create character' }), { status: 500 })
  }
}

