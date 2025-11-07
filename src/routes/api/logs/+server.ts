import { json } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'

interface LogEntry {
  level: 'log' | 'warn' | 'error'
  message: string
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  const level = record['level']
  const message = record['message']
  if (level !== 'log' && level !== 'warn' && level !== 'error') {
    return false
  }
  if (typeof message !== 'string' || message.length === 0) {
    return false
  }
  return true
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ success: false, error: 'Invalid JSON payload' }, { status: 400 })
  }

  const entries: LogEntry[] = []
  if (Array.isArray((body as Record<string, unknown>)?.entries)) {
    const rows = (body as Record<string, unknown>).entries as unknown[]
    for (const row of rows) {
      if (isLogEntry(row)) {
        entries.push(row)
      }
    }
  } else if (isLogEntry(body)) {
    entries.push(body)
  }

  if (entries.length === 0) {
    return json({ success: false, error: 'No valid log entries found' }, { status: 400 })
  }

  for (const entry of entries) {
    switch (entry.level) {
      case 'warn':
        console.warn(entry.message)
        break
      case 'error':
        console.error(entry.message)
        break
      default:
        console.log(entry.message)
        break
    }
  }

  return json({ success: true })
}
