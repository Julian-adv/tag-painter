// High-level CHARX-JPEG helpers built on the minimal ZIP utilities
import { writeZipStored, readZip, type ZipEntryInput, type ZipEntryOutput } from './zip'
import { Unzip, UnzipInflate } from 'fflate'

export interface CharxWriteOptions {
  // Optional map of logical path -> data
  entries?: { name: string; data: Uint8Array | string }[]
}

export function concatArrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function decodeText(data: Uint8Array): string {
  return new TextDecoder().decode(data)
}

// Create a CHARX-JPEG file by appending a store-only ZIP after a JPEG payload
export function writeCharxJpeg(
  baseJpeg: Uint8Array,
  entries: { name: string; data: Uint8Array | string }[]
): Uint8Array {
  const zipEntries: ZipEntryInput[] = entries.map((e) => ({
    name: e.name,
    data: typeof e.data === 'string' ? encodeText(e.data) : e.data
  }))
  const zip = writeZipStored(zipEntries)
  return concatArrays(baseJpeg, zip)
}

// Convenience to build a v3-like package with a card.json and optional assets
export function writeCharxJpegWithCard(
  baseJpeg: Uint8Array,
  cardJson: unknown,
  assets?: { path: string; data: Uint8Array }[]
): Uint8Array {
  const entries: { name: string; data: Uint8Array | string }[] = []
  entries.push({ name: 'card.json', data: JSON.stringify(cardJson, null, 2) })
  if (assets) {
    for (const a of assets) {
      entries.push({ name: a.path, data: a.data })
    }
  }
  return writeCharxJpeg(baseJpeg, entries)
}

export interface CharxReadResult {
  files: ZipEntryOutput[]
  getText: (name: string) => string | null
  getBytes: (name: string) => Uint8Array | null
}

export function readCharxJpeg(buffer: Uint8Array): CharxReadResult {
  const files = readZip(buffer)
  const byName = new Map<string, Uint8Array>()
  for (const f of files) byName.set(f.name, f.data)
  return {
    files,
    getText: (name: string) => {
      const d = byName.get(name)
      return d ? decodeText(d) : null
    },
    getBytes: (name: string) => byName.get(name) || null
  }
}

// Compat reader using fflate.Unzip like RisuAI. Falls back to readZip if fflate is unavailable.
export function readCharxJpegCompat(buffer: Uint8Array): CharxReadResult {
  const unzip = new Unzip()
  unzip.register(UnzipInflate)

  const collected: { name: string; data: Uint8Array }[] = []
  const buffers: Record<string, Uint8Array[]> = {}

  unzip.onfile = (file: any) => {
    const name: string = file.name
    buffers[name] = []
    file.ondata = (_err: any, dat: Uint8Array, final: boolean) => {
      if (dat && dat.length) buffers[name].push(dat)
      if (final) {
        const total = buffers[name].reduce((s, b) => s + b.length, 0)
        const out = new Uint8Array(total)
        let p = 0
        for (const b of buffers[name]) {
          out.set(b, p)
          p += b.length
        }
        collected.push({ name, data: out })
      }
    }
    file.start?.()
  }

  // Push whole buffer; Unzip scans local headers even if there is a JPEG preamble
  unzip.push(buffer, true)

  const byName = new Map<string, Uint8Array>()
  for (const f of collected) byName.set(f.name, f.data)
  return {
    files: collected,
    getText: (name: string) => {
      const d = byName.get(name)
      return d ? decodeText(d) : null
    },
    getBytes: (name: string) => byName.get(name) || null
  }
}
