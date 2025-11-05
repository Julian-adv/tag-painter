import { writable, get } from 'svelte/store'

type LoraPathSeparator = '/' | '\\'

const DEFAULT_SEPARATOR: LoraPathSeparator = '/'

export const loraPathSeparator = writable<LoraPathSeparator>(DEFAULT_SEPARATOR)

export function updateLoraPathSeparatorFromList(loras: string[] | undefined | null): void {
  if (!Array.isArray(loras) || loras.length === 0) {
    return
  }
  const hasBackslash = loras.some((name) => name.includes('\\'))
  if (hasBackslash) {
    loraPathSeparator.set('\\')
    return
  }
  loraPathSeparator.set('/')
}

export function normalizeLoraNameForDisplay(name: string): string {
  return typeof name === 'string' ? name.replace(/\\/g, '/') : name
}

export function resolveLoraNameForComfy(name: string): string {
  if (typeof name !== 'string') {
    return name as unknown as string
  }
  const separator = get(loraPathSeparator)
  if (separator === '\\') {
    return name.replace(/\//g, '\\')
  }
  return name.replace(/\\/g, '/')
}
