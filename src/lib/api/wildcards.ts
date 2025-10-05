// APIs for reading/writing wildcards.yaml
// Keep minimal and reusable across components.

export async function fetchWildcardsText(filename?: string): Promise<string> {
  try {
    const params = filename ? `?filename=${encodeURIComponent(filename)}` : ''
    const res = await fetch(`/api/wildcards${params}`)
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Wildcards file not found: ${filename}`)
      }
      return ''
    }
    return await res.text()
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found')) {
      throw e
    }
    console.error(`Failed to load ${filename || 'wildcards file'}:`, e)
    return ''
  }
}

export async function saveWildcardsText(text: string, filename?: string): Promise<void> {
  const params = filename ? `?filename=${encodeURIComponent(filename)}` : ''
  const res = await fetch(`/api/wildcards${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text
  })
  if (!res.ok) throw new Error(`Failed to save ${filename || 'wildcards file'}`)
}
