// Minimal ZIP (store-only) writer/reader for CHARX-JPEG support
// - Writes central directory with no compression (method 0)
// - Reads archives by parsing EOCD and central directory

export interface ZipEntryInput {
  name: string
  data: Uint8Array
  modTime?: Date
}

export interface ZipEntryOutput {
  name: string
  data: Uint8Array
}

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function toDosTime(d: Date) {
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const seconds = Math.floor(d.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | (month << 5) | day
  const dosTime = (hours << 11) | (minutes << 5) | seconds
  return { dosDate, dosTime }
}

// CRC32 implementation for ZIP
const CRC_TABLE = new Uint32Array(256)
;(function initCrc() {
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    CRC_TABLE[n] = c >>> 0
  }
})()

function crc32(buf: Uint8Array): number {
  let c = 0 ^ -1
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff]
  }
  return (c ^ -1) >>> 0
}

function writeUint16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true)
}

function writeUint32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true)
}

export function writeZipStored(entries: ZipEntryInput[]): Uint8Array {
  const localRecords: { offset: number; headerLen: number; nameBytes: Uint8Array; crc: number; size: number }[] = []
  const parts: Uint8Array[] = []
  let offset = 0

  // Local file headers + data
  for (const e of entries) {
    const nameBytes = TEXT_ENCODER.encode(e.name)
    const dataBytes = e.data
    const crc = crc32(dataBytes)
    const now = e.modTime || new Date()
    const { dosDate, dosTime } = toDosTime(now)

    const header = new Uint8Array(30 + nameBytes.length)
    const v = new DataView(header.buffer)
    writeUint32LE(v, 0, 0x04034b50) // local file header sig
    writeUint16LE(v, 4, 20) // version needed
    writeUint16LE(v, 6, 0) // flags
    writeUint16LE(v, 8, 0) // compression method 0=store
    writeUint16LE(v, 10, dosTime)
    writeUint16LE(v, 12, dosDate)
    writeUint32LE(v, 14, crc)
    writeUint32LE(v, 18, dataBytes.length)
    writeUint32LE(v, 22, dataBytes.length)
    writeUint16LE(v, 26, nameBytes.length)
    writeUint16LE(v, 28, 0) // extra len
    header.set(nameBytes, 30)

    parts.push(header)
    parts.push(dataBytes)

    localRecords.push({ offset, headerLen: header.length, nameBytes, crc, size: dataBytes.length })
    offset += header.length + dataBytes.length
  }

  const centralParts: Uint8Array[] = []
  let centralSize = 0
  const centralStart = offset

  // Central directory
  for (const rec of localRecords) {
    const header = new Uint8Array(46 + rec.nameBytes.length)
    const v = new DataView(header.buffer)
    writeUint32LE(v, 0, 0x02014b50)
    writeUint16LE(v, 4, 20) // version made by
    writeUint16LE(v, 6, 20) // version needed
    writeUint16LE(v, 8, 0) // flags
    writeUint16LE(v, 10, 0) // compression
    // Use current date/time for central entries; not critical
    const now = new Date()
    const { dosDate, dosTime } = toDosTime(now)
    writeUint16LE(v, 12, dosTime)
    writeUint16LE(v, 14, dosDate)
    writeUint32LE(v, 16, rec.crc)
    writeUint32LE(v, 20, rec.size)
    writeUint32LE(v, 24, rec.size)
    writeUint16LE(v, 28, rec.nameBytes.length)
    writeUint16LE(v, 30, 0) // extra len
    writeUint16LE(v, 32, 0) // file comment len
    writeUint16LE(v, 34, 0) // disk number start
    writeUint16LE(v, 36, 0) // internal attrs
    writeUint32LE(v, 38, 0) // external attrs
    writeUint32LE(v, 42, rec.offset)
    header.set(rec.nameBytes, 46)
    centralParts.push(header)
    centralSize += header.length
  }

  parts.push(...centralParts)

  // EOCD
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  writeUint32LE(ev, 0, 0x06054b50)
  writeUint16LE(ev, 4, 0) // disk number
  writeUint16LE(ev, 6, 0) // disk with central dir
  writeUint16LE(ev, 8, localRecords.length)
  writeUint16LE(ev, 10, localRecords.length)
  writeUint32LE(ev, 12, centralSize)
  writeUint32LE(ev, 16, centralStart)
  writeUint16LE(ev, 20, 0) // comment len
  parts.push(eocd)

  // Concat
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let ptr = 0
  for (const p of parts) {
    out.set(p, ptr)
    ptr += p.length
  }
  return out
}

function findEOCD(buf: Uint8Array): number {
  // EOCD signature 0x06054b50, scan last 64KB
  const maxScan = Math.min(buf.length, 65557)
  for (let i = buf.length - 22; i >= buf.length - maxScan; i--) {
    if (i < 0) break
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06
    ) {
      return i
    }
  }
  return -1
}

export function readZip(buf: Uint8Array): ZipEntryOutput[] {
  const eocdOffset = findEOCD(buf)
  if (eocdOffset < 0) {
    throw new Error('ZIP EOCD not found')
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const centralSize = dv.getUint32(eocdOffset + 12, true)
  const centralOffset = dv.getUint32(eocdOffset + 16, true)
  const entriesCount = dv.getUint16(eocdOffset + 10, true)

  let ptr = centralOffset
  const files: ZipEntryOutput[] = []
  for (let n = 0; n < entriesCount; n++) {
    const sig = dv.getUint32(ptr, true)
    if (sig !== 0x02014b50) {
      throw new Error('Invalid central directory header')
    }
    const compression = dv.getUint16(ptr + 10, true)
    const nameLen = dv.getUint16(ptr + 28, true)
    const extraLen = dv.getUint16(ptr + 30, true)
    const commentLen = dv.getUint16(ptr + 32, true)
    const localOffset = dv.getUint32(ptr + 42, true)
    const nameBytes = buf.subarray(ptr + 46, ptr + 46 + nameLen)
    const name = TEXT_DECODER.decode(nameBytes)
    ptr += 46 + nameLen + extraLen + commentLen

    if (compression !== 0) {
      // Only store method supported
      continue
    }

    const lSig = dv.getUint32(localOffset, true)
    if (lSig !== 0x04034b50) continue
    const lNameLen = dv.getUint16(localOffset + 26, true)
    const lExtraLen = dv.getUint16(localOffset + 28, true)
    const compSize = dv.getUint32(localOffset + 18, true)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)
    files.push({ name, data })
  }
  return files
}

