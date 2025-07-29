import { json } from '@sveltejs/kit'
import path from 'path'
import { cwd } from 'process'

export async function GET() {
  try {
    const maskImagePath = path.join(cwd(), 'static', 'left-horizontal-mask.png')
    return json({ maskImagePath })
  } catch {
    return json({ error: 'Failed to resolve mask path' }, { status: 500 })
  }
}