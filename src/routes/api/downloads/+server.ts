import type { RequestHandler } from '@sveltejs/kit'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

type DownloadItem = {
  label: string
  filename: string
  urls: string[]
  destRelativeToComfy: string
  category: string | null
}

type DownloadsConfig = {
  items: DownloadItem[]
}

type ResultEntry = {
  filename: string
  ok: boolean
  url: string | null
  error: string | null
}

function normalizeCategory(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getComfyDir(): string {
  return path.resolve(process.cwd(), 'vendor', 'ComfyUI')
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function loadConfig(): Promise<DownloadsConfig> {
  const configPath = path.resolve(process.cwd(), 'config', 'downloads.json')
  const text = await readFile(configPath, 'utf-8')
  const data = JSON.parse(text) as Record<string, unknown>
  const rawItems = Array.isArray(data.items) ? data.items : []
  const items = rawItems
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const record = entry as Record<string, unknown>
      const label = typeof record.label === 'string' ? record.label : ''
      const filename = typeof record.filename === 'string' ? record.filename : ''
      const urlsSource = Array.isArray(record.urls) ? record.urls : []
      const urls = urlsSource.filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
      const dest = typeof record.destRelativeToComfy === 'string' ? record.destRelativeToComfy : ''
      const category = normalizeCategory(record.category)
      if (!label || !filename || urls.length === 0 || !dest) {
        return null
      }
      return { label, filename, urls, destRelativeToComfy: dest, category }
    })
    .filter((entry): entry is DownloadItem => entry !== null)
  return { items }
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const cfg = await loadConfig()
    const comfyDir = getComfyDir()
    const requestedCategory = normalizeCategory(url.searchParams.get('category'))
    const filtered =
      requestedCategory === null
        ? cfg.items
        : cfg.items.filter((it) => it.category === requestedCategory)
    const items = filtered.map((it) => ({
      label: it.label,
      filename: it.filename,
      urls: it.urls,
      category: it.category,
      dest: path.join(comfyDir, it.destRelativeToComfy)
    }))
    return new Response(JSON.stringify({ items }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to read downloads config' }), {
      status: 500
    })
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const raw = (await request.json()) as Record<string, unknown>
    const filenamesValue = raw.filenames
    const filenames =
      Array.isArray(filenamesValue)
        ? filenamesValue.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : null
    const onlyMissing = raw.onlyMissing === false ? false : true
    const categoryFilter = normalizeCategory(raw.category)

    const cfg = await loadConfig()
    const comfyDir = getComfyDir()

    const categoryFiltered =
      categoryFilter === null ? cfg.items : cfg.items.filter((it) => it.category === categoryFilter)
    const nameSet = filenames === null ? null : new Set(filenames)
    const targets = categoryFiltered
      .filter((it) => (nameSet === null ? true : nameSet.has(it.filename)))
      .map((it) => ({ ...it, dest: path.join(comfyDir, it.destRelativeToComfy) }))

    const results: ResultEntry[] = []

    for (const item of targets) {
      try {
        if (onlyMissing && (await fileExists(item.dest))) {
          results.push({ filename: item.filename, ok: true, url: null, error: null })
          continue
        }
        await mkdir(path.dirname(item.dest), { recursive: true })

        let success = false
        let lastErr = ''
        for (const u of item.urls) {
          try {
            const res = await fetch(u, {
              method: 'GET',
              headers: { 'User-Agent': 'TagPainter/0.5 (download)' },
              redirect: 'follow'
            })
            if (!res.ok) {
              lastErr = `HTTP ${res.status}`
              continue
            }
            const buf = Buffer.from(await res.arrayBuffer())
            const ct = res.headers.get('content-type') || ''
            if (buf.length < 100_000 && ct.includes('text/')) {
              lastErr = 'Response looks like HTML/text'
              continue
            }
            await writeFile(item.dest, buf)
            success = true
            results.push({ filename: item.filename, ok: true, url: u, error: null })
            break
          } catch (err: unknown) {
            lastErr = err instanceof Error ? err.message : String(err)
          }
        }
        if (!success) {
          results.push({
            filename: item.filename,
            ok: false,
            url: null,
            error: lastErr.length > 0 ? lastErr : null
          })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ filename: item.filename, ok: false, url: null, error: message })
      }
    }

    const failed = results.filter((entry) => !entry.ok)
    const ok = results.filter((entry) => entry.ok)
    const status = failed.length > 0 ? 207 : 200
    return new Response(JSON.stringify({ success: failed.length === 0, ok, failed }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to process download request' }), {
      status: 500
    })
  }
}
