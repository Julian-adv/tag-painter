import { json } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const SYSTEM_PROMPT_PATH = path.resolve(process.cwd(), 'data', 'system_prompt.txt')

export async function GET() {
  try {
    const prompt = await fs.readFile(SYSTEM_PROMPT_PATH, 'utf-8')
    return json({ success: true, prompt })
  } catch (error) {
    console.error('Failed to read system prompt:', error)
    return json({ success: false, prompt: '' }, { status: 200 })
  }
}
