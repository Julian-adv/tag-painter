interface ClientLogEntry {
  level: 'log' | 'warn' | 'error'
  message: string
}

const LOG_ENDPOINT = '/api/logs'
const logQueue: ClientLogEntry[] = []
let flushScheduled = false

function flushQueue() {
  if (logQueue.length === 0) {
    flushScheduled = false
    return
  }

  const payload = logQueue.splice(0, logQueue.length)
  flushScheduled = false

  if (typeof fetch === 'undefined') {
    return
  }

  void fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: payload })
  }).catch(() => {
    // ignore network errors
  })
}

function scheduleFlush() {
  if (flushScheduled) return
  flushScheduled = true
  setTimeout(flushQueue, 250)
}

export function sendClientLog(level: 'log' | 'warn' | 'error', message: string) {
  if (typeof window === 'undefined') {
    return
  }
  logQueue.push({ level, message })
  scheduleFlush()
}
