// APIs for reading/writing wildcards.yaml
// Keep minimal and reusable across components.

import { getWildcardsFileName } from '../utils/wildcards'

export async function fetchWildcardsText(modelType?: string): Promise<string> {
  try {
    const params = modelType ? `?modelType=${encodeURIComponent(modelType)}` : ''
    const res = await fetch(`/api/wildcards${params}`)
    if (!res.ok) return ''
    return await res.text()
  } catch (e) {
    const fileName = getWildcardsFileName(modelType)
    console.error(`Failed to load ${fileName}:`, e)
    return ''
  }
}

export async function saveWildcardsText(text: string, modelType?: string): Promise<void> {
  const params = modelType ? `?modelType=${encodeURIComponent(modelType)}` : ''
  const res = await fetch(`/api/wildcards${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text
  })
  const fileName = getWildcardsFileName(modelType)
  if (!res.ok) throw new Error(`Failed to save ${fileName}`)
}
