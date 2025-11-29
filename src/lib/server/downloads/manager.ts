import path from 'node:path'
import { spawn } from 'node:child_process'
import { unzipSync } from 'fflate'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileExists, findComfyPython, getComfyDir } from '$lib/server/comfy'

export type DownloadKind = 'file' | 'archive' | 'git'

export type DownloadItem = {
  label: string
  filename: string
  urls: string[]
  destRelativeToComfy: string
  category: string | null
  kind: DownloadKind
  branch: string | null
}

export type DownloadsConfig = {
  items: DownloadItem[]
}

export type ResultEntry = {
  filename: string
  ok: boolean
  url: string | null
  error: string | null
}

export type StreamEvent =
  | { type: 'file-start'; filename: string; label: string; kind: DownloadKind }
  | { type: 'file-progress'; filename: string; receivedBytes: number; totalBytes: number | null; message?: string }
  | { type: 'file-attempt-error'; filename: string; error: string; url: string }
  | { type: 'file-complete'; filename: string; url: string | null }
  | { type: 'file-error'; filename: string; error: string }
  | { type: 'overall'; completed: number; total: number }
  | { type: 'all-complete'; success: boolean; ok: ResultEntry[]; failed: ResultEntry[] }
  | { type: 'error'; error: string }

const JSONL_HEADER = { 'Content-Type': 'application/x-ndjson' }

export function normalizeCategory(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return null
}

export function parseKind(value: unknown): DownloadKind {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'archive') return 'archive'
    if (lowered === 'git') return 'git'
  }
  return 'file'
}

export async function loadDownloadsConfig(): Promise<DownloadsConfig> {
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
      const kind = parseKind(record.kind)
      const branch =
        typeof record.branch === 'string' && record.branch.length > 0 ? record.branch : null
      if (!label || !filename || urls.length === 0 || !dest) {
        return null
      }
      return { label, filename, urls, destRelativeToComfy: dest, category, kind, branch }
    })
    .filter((entry): entry is DownloadItem => entry !== null)
  return { items }
}

async function ensureParentDir(targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true })
}

async function extractArchive(buffer: Buffer, destDir: string): Promise<void> {
  const entries = unzipSync(buffer)
  const names = Object.keys(entries)
  if (names.length === 0) return
  const rootCandidates = new Set<string>()
  for (const name of names) {
    const normalized = name.replace(/\\/g, '/')
    if (!normalized) continue
    const parts = normalized.split('/')
    if (parts.length > 1 && parts[0].length > 0) {
      rootCandidates.add(parts[0])
    }
  }
  const rootPrefix = rootCandidates.size === 1 ? `${Array.from(rootCandidates)[0]}/` : ''
  for (const name of names) {
    const entry = entries[name]
    let normalized = name.replace(/\\/g, '/')
    if (rootPrefix && normalized.startsWith(rootPrefix)) {
      normalized = normalized.slice(rootPrefix.length)
    }
    normalized = normalized.replace(/^\/+/, '')
    if (!normalized) continue
    const fullPath = path.join(destDir, normalized)
    if (normalized.endsWith('/')) {
      await mkdir(fullPath, { recursive: true })
      continue
    }
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, Buffer.from(entry))
  }
}

async function findGitExecutable(): Promise<string> {
  const candidates: string[] = []
  const isWindows = process.platform === 'win32'
  candidates.push('git')

  const vendorGit = path.resolve(process.cwd(), 'vendor', 'git')
  if (isWindows) {
    candidates.push(
      path.join(vendorGit, 'cmd', 'git.exe'),
      path.join(vendorGit, 'bin', 'git.exe'),
      path.join(vendorGit, 'usr', 'bin', 'git.exe')
    )
  } else {
    candidates.push(
      path.join(vendorGit, 'bin', 'git'),
      path.join(vendorGit, 'usr', 'bin', 'git')
    )
  }

  for (const candidate of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(candidate, ['--version'])
        proc.on('error', reject)
        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`git exited with code ${code}`))
        })
      })
      return candidate
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('git executable not found. Run bootstrap to install vendor git.')
}

async function installRequirementsIfPresent(destDir: string): Promise<void> {
  const requirementsPath = path.join(destDir, 'requirements.txt')
  if (!(await fileExists(requirementsPath))) return

  // Wait for filesystem to sync after git clone
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const python = await findComfyPython()
  if (!python) {
    throw new Error('Python environment not found (expected vendor/comfy-venv)')
  }

  try {
    // Try to use pip directly first (more reliable)
    const pipPath = python.replace(/python(\.exe)?$/i, process.platform === 'win32' ? 'pip.exe' : 'pip')
    const usePipDirect = await fileExists(pipPath)

    const command = usePipDirect ? pipPath : python
    const args = usePipDirect
      ? ['install', '--no-warn-conflicts', '-r', requirementsPath]
      : ['-m', 'pip', 'install', '--no-warn-conflicts', '-r', requirementsPath]

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'inherit',
        shell: false
      })
      proc.on('error', (err) => reject(err))
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`pip exited with code ${code}`))
      })
    })
  } catch (err) {
    // Log warning but don't fail the entire installation
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`Warning: Failed to install requirements for ${destDir}: ${message}`)
    console.warn('Continuing with installation...')
  }

  // Wait after installation to prevent race conditions with next installation
  await new Promise((resolve) => setTimeout(resolve, 500))
}

async function cloneGitRepository(
  item: DownloadItem & { dest: string },
  repoUrl: string,
  send: (event: StreamEvent) => void
): Promise<void> {
  const git = await findGitExecutable()
  const exists = await fileExists(item.dest)

  if (exists) {
    // If repository already exists, pull latest changes
    send({
      type: 'file-progress',
      filename: item.filename,
      receivedBytes: 0,
      totalBytes: null,
      message: `Updating ${item.filename} from ${repoUrl}`
    })

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(git, ['pull'], {
          cwd: item.dest,
          stdio: 'inherit'
        })
        proc.on('error', reject)
        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`git pull exited with code ${code}`))
        })
      })
    } catch (err) {
      // If pull fails, log warning but continue with requirements installation
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`Warning: git pull failed for ${item.filename}: ${message}`)
      send({
        type: 'file-progress',
        filename: item.filename,
        receivedBytes: 0,
        totalBytes: null,
        message: `Warning: Failed to update ${item.filename}, using existing version`
      })
    }
  } else {
    // Clone repository if it doesn't exist
    const targetRef = await resolveGitRef(item, repoUrl, git, send)
    await ensureParentDir(item.dest)
    send({
      type: 'file-progress',
      filename: item.filename,
      receivedBytes: 0,
      totalBytes: null,
      message: `Cloning ${repoUrl}${targetRef ? ` (${targetRef})` : ''}`
    })
    const args = ['clone', '--depth', '1']
    if (targetRef) {
      args.push('--branch', targetRef)
    }
    args.push(repoUrl, item.dest)
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(git, args, { stdio: 'inherit' })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`git clone exited with code ${code}`))
      })
    })
  }

  // Always install requirements (whether cloned or pulled)
  await installRequirementsIfPresent(item.dest)
}

async function resolveGitRef(
  item: DownloadItem,
  repoUrl: string,
  git: string,
  send: (event: StreamEvent) => void
): Promise<string | null> {
  if (!item.branch) {
    return null
  }
  if (item.branch.toLowerCase() !== 'latest') {
    return item.branch
  }

  send({
    type: 'file-progress',
    filename: item.filename,
    receivedBytes: 0,
    totalBytes: null,
    message: 'Resolving latest tag'
  })

  const latestTag = await findLatestTag(repoUrl, git)
  if (latestTag) {
    return latestTag
  }

  console.warn(`No tags found for ${repoUrl}; falling back to default branch.`)
  return null
}

async function findLatestTag(repoUrl: string, git: string): Promise<string | null> {
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn(git, ['ls-remote', '--tags', '--sort=-v:refname', repoUrl])
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout)
        else reject(new Error(stderr || `git ls-remote exited with code ${code}`))
      })
    })

    const lines = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    for (const line of lines) {
      const parts = line.split(/\s+/)
      if (parts.length < 2) continue
      const ref = parts[1]
      if (!ref.startsWith('refs/tags/')) continue
      const tagName = ref.replace('refs/tags/', '').replace(/\^\{\}$/, '')
      if (tagName) {
        return tagName
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`Failed to resolve latest tag for ${repoUrl}: ${message}`)
  }
  return null
}

async function downloadAndHandle(
  item: DownloadItem & { dest: string },
  url: string,
  send: (event: StreamEvent) => void
): Promise<{ url: string }> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'TagPainter/0.5 (download)' },
    redirect: 'follow'
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const lengthHeader = response.headers.get('content-length')
  let totalBytes: number | null = null
  if (lengthHeader) {
    const parsed = Number(lengthHeader)
    if (Number.isFinite(parsed) && parsed >= 0) {
      totalBytes = parsed
    }
  }

  await ensureParentDir(item.dest)
  const tempPath = `${item.dest}.download`
  const fileHandle = await open(tempPath, 'w')
  let received = 0
  try {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body received')
    }
    send({
      type: 'file-progress',
      filename: item.filename,
      receivedBytes: 0,
      totalBytes,
      message: undefined
    })
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value && value.length > 0) {
        received += value.length
        await fileHandle.write(value)
        send({
          type: 'file-progress',
          filename: item.filename,
          receivedBytes: received,
          totalBytes,
          message: undefined
        })
      }
    }
    await fileHandle.close()
    if (item.kind === 'file') {
      await rm(item.dest, { force: true })
      await rename(tempPath, item.dest)
    } else if (item.kind === 'archive') {
      const buffer = await readFile(tempPath)
      await rm(tempPath, { force: true })
      await rm(item.dest, { recursive: true, force: true })
      await mkdir(item.dest, { recursive: true })
      await extractArchive(buffer, item.dest)
      await installRequirementsIfPresent(item.dest)
    } else {
      await rm(tempPath, { force: true })
      throw new Error(`Unsupported download kind: ${item.kind}`)
    }
    return { url }
  } catch (err) {
    try {
      await fileHandle.close()
    } catch {
      // ignore
    }
    await rm(tempPath, { force: true })
    throw err
  }
}

export async function handleGetDownloads(url: URL): Promise<Response> {
  try {
    const cfg = await loadDownloadsConfig()
    const comfyDir = getComfyDir()
    const requestedCategory = normalizeCategory(url.searchParams.get('category'))
    const onlyMissing =
      (url.searchParams.has('onlyMissing') && url.searchParams.get('onlyMissing') !== '0') || false

    const filtered =
      requestedCategory === null
        ? cfg.items
        : cfg.items.filter((it) => it.category === requestedCategory)

    const items = []
    for (const item of filtered) {
      const dest = path.join(comfyDir, item.destRelativeToComfy)
      const exists = await fileExists(dest)
      if (onlyMissing && exists) {
        continue
      }
      items.push({
        label: item.label,
        filename: item.filename,
        urls: item.urls,
        category: item.category,
        kind: item.kind,
        branch: item.branch,
        dest,
        exists
      })
    }

    return new Response(JSON.stringify({ items }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read downloads config'
    return new Response(JSON.stringify({ error: message }), {
      status: 500
    })
  }
}

function isLargeModelFile(dest: string): boolean {
  const normalized = dest.toLowerCase().replace(/\\/g, '/')
  return (
    normalized.includes('checkpoints/') ||
    normalized.includes('diffusion_models/') ||
    normalized.includes('loras/')
  )
}

export async function checkStep1FilesExist(): Promise<{ allExist: boolean; missingFilenames: string[] }> {
  try {
    const cfg = await loadDownloadsConfig()
    const comfyDir = getComfyDir()

    // Filter to step 1 items only (non-large model files, excluding custom-nodes)
    const step1Items = cfg.items.filter(
      (item) => !isLargeModelFile(item.destRelativeToComfy) && item.category !== 'custom-node'
    )

    if (step1Items.length === 0) {
      return { allExist: true, missingFilenames: [] } // No step 1 files required
    }

    // Check which step 1 files are missing
    const missingFilenames: string[] = []
    for (const item of step1Items) {
      const dest = path.join(comfyDir, item.destRelativeToComfy)
      const exists = await fileExists(dest)
      if (!exists) {
        missingFilenames.push(item.filename)
      }
    }

    return {
      allExist: missingFilenames.length === 0,
      missingFilenames
    }
  } catch {
    return { allExist: false, missingFilenames: [] } // On error, assume files are missing
  }
}

export async function handlePostDownloads(request: Request): Promise<Response> {
  try {
    const raw = (await request.json()) as Record<string, unknown>
    const filenamesValue = raw.filenames
    const filenames =
      Array.isArray(filenamesValue)
        ? filenamesValue.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : null
    const onlyMissing = raw.onlyMissing === false ? false : true
    const categoryFilter = normalizeCategory(raw.category)

    const cfg = await loadDownloadsConfig()
    const comfyDir = getComfyDir()

    const categoryFiltered =
      categoryFilter === null ? cfg.items : cfg.items.filter((it) => it.category === categoryFilter)
    const nameSet = filenames === null ? null : new Set(filenames)
    const targets = categoryFiltered
      .filter((it) => (nameSet === null ? true : nameSet.has(it.filename)))
      .map((it) => ({ ...it, dest: path.join(comfyDir, it.destRelativeToComfy) }))

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        const send = (event: StreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }

        ;(async () => {
          const ok: ResultEntry[] = []
          const failed: ResultEntry[] = []
          let completed = 0

          for (const item of targets) {
            send({ type: 'file-start', filename: item.filename, label: item.label, kind: item.kind })

            // Skip only if onlyMissing is true, file exists, and it's not a git repository
            // Git repositories should always be updated (pull) even if they exist
            if (onlyMissing && (await fileExists(item.dest)) && item.kind !== 'git') {
              ok.push({ filename: item.filename, ok: true, url: null, error: null })
              send({ type: 'file-complete', filename: item.filename, url: null })
              completed += 1
              send({ type: 'overall', completed, total: targets.length })
              continue
            }

            try {
              await ensureParentDir(item.dest)
              if (item.kind === 'git') {
                let success = false
                let lastErr = ''
                for (const repo of item.urls) {
                  try {
                    await cloneGitRepository(item, repo, send)
                    ok.push({ filename: item.filename, ok: true, url: repo, error: null })
                    send({ type: 'file-complete', filename: item.filename, url: repo })
                    success = true
                    break
                  } catch (err) {
                    lastErr = err instanceof Error ? err.message : String(err)
                    send({ type: 'file-attempt-error', filename: item.filename, error: lastErr, url: repo })
                  }
                }
                if (!success) {
                  failed.push({
                    filename: item.filename,
                    ok: false,
                    url: null,
                    error: lastErr || 'Git clone failed'
                  })
                  send({
                    type: 'file-error',
                    filename: item.filename,
                    error: lastErr || 'Git clone failed'
                  })
                }
              } else {
                let success = false
                let lastErr = ''
                for (const url of item.urls) {
                  try {
                    const info = await downloadAndHandle(item, url, send)
                    ok.push({ filename: item.filename, ok: true, url: info.url, error: null })
                    send({ type: 'file-complete', filename: item.filename, url: info.url })
                    success = true
                    break
                  } catch (err) {
                    lastErr = err instanceof Error ? err.message : String(err)
                    send({ type: 'file-attempt-error', filename: item.filename, error: lastErr, url })
                  }
                }
                if (!success) {
                  failed.push({
                    filename: item.filename,
                    ok: false,
                    url: null,
                    error: lastErr || 'Download failed'
                  })
                  send({
                    type: 'file-error',
                    filename: item.filename,
                    error: lastErr || 'Download failed'
                  })
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              failed.push({ filename: item.filename, ok: false, url: null, error: message })
              send({ type: 'file-error', filename: item.filename, error: message })
            }

            completed += 1
            send({ type: 'overall', completed, total: targets.length })
          }

          send({
            type: 'all-complete',
            success: ok.length > 0,
            ok,
            failed
          })
          controller.close()
        })().catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', error: message })}\n`))
          controller.close()
        })
      }
    })

    return new Response(stream, { headers: JSONL_HEADER })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process download request'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
