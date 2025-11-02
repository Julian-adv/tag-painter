// Read and dump card.json from a CHARX-JPEG
import { readFile } from 'node:fs/promises'
import { Unzip, UnzipInflate } from 'fflate'

async function readCharx(buffer) {
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  const collected = []
  const buffers = {}
  unzip.onfile = (file) => {
    const name = file.name
    buffers[name] = []
    file.ondata = (_err, dat, final) => {
      if (dat && dat.length) buffers[name].push(dat)
      if (final) {
        const total = buffers[name].reduce((s, b) => s + b.length, 0)
        const out = new Uint8Array(total)
        let p = 0
        for (const b of buffers[name]) { out.set(b, p); p += b.length }
        collected.push({ name, data: out })
      }
    }
    file.start?.()
  }
  unzip.push(buffer, true)
  return collected
}

const path = process.argv[2] || 'data/character/jane.jpeg'
const buf = new Uint8Array(await readFile(path))
const entries = await readCharx(buf)
console.log('Entries:', entries.map(e => `${e.name} (${e.data.length} bytes)`))
const card = entries.find(e => e.name === 'card.json' || e.name === 'chara' || e.name === 'ccv3')
if (card) {
  const text = new TextDecoder().decode(card.data)
  console.log('--- card.json/chara ---')
  console.log(text.slice(0, 1000))
} else {
  console.log('No card.json/chara found')
}
