// APIs for reading/writing wildcards.yaml
// Keep minimal and reusable across components.

export async function fetchWildcardsText(): Promise<string> {
  try {
    const res = await fetch('/api/wildcards')
    if (!res.ok) return ''
    return await res.text()
  } catch (e) {
    console.error('Failed to load wildcards.yaml:', e)
    return ''
  }
}

export async function saveWildcardsText(text: string): Promise<void> {
  const res = await fetch('/api/wildcards', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text
  })
  if (!res.ok) throw new Error('Failed to save wildcards.yaml')
}

