import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'

const CHAT_HISTORY_PATH = join(process.cwd(), 'data', 'chat_history.json')

export const GET: RequestHandler = async () => {
  try {
    const data = await readFile(CHAT_HISTORY_PATH, 'utf-8')
    const messages = JSON.parse(data)
    return json({ messages })
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return json({ messages: [] })
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messages } = await request.json()

    // Ensure data directory exists
    await mkdir(join(process.cwd(), 'data'), { recursive: true })

    // Save messages to file
    await writeFile(CHAT_HISTORY_PATH, JSON.stringify(messages, null, 2), 'utf-8')

    return json({ success: true })
  } catch (error) {
    console.error('Failed to save chat history:', error)
    return json({ success: false, error: 'Failed to save chat history' }, { status: 500 })
  }
}
