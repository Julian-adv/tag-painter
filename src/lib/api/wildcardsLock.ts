// Client-side mutex for wildcards file operations
// Ensures read-modify-write operations are atomic

const locks = new Map<string, Promise<void>>()

export async function withWildcardsLock<T>(
  filename: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const key = filename || 'default'

  // Wait for any existing lock
  const existingLock = locks.get(key)

  let releaseLock: () => void
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })

  // Set the new lock before waiting
  locks.set(key, newLock)

  try {
    if (existingLock) {
      await existingLock
    }
    return await fn()
  } finally {
    releaseLock!()
    if (locks.get(key) === newLock) {
      locks.delete(key)
    }
  }
}
