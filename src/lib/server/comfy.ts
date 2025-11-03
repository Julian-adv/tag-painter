import path from 'node:path'
import { stat } from 'node:fs/promises'

export function getComfyDir(): string {
  return path.resolve(process.cwd(), 'vendor', 'ComfyUI')
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function findComfyPython(): Promise<string | null> {
  const vendorDir = path.resolve(process.cwd(), 'vendor')
  const winPath = path.join(vendorDir, 'comfy-venv', 'Scripts', 'python.exe')
  if (await fileExists(winPath)) {
    return winPath
  }
  const unixPath = path.join(vendorDir, 'comfy-venv', 'bin', 'python')
  if (await fileExists(unixPath)) {
    return unixPath
  }
  return null
}
