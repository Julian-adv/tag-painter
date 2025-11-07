import type { RequestHandler } from '@sveltejs/kit'
import { getComfyDir, fileExists, findComfyPython } from '$lib/server/comfy'

export const GET: RequestHandler = async () => {
  const comfyDir = getComfyDir()
  const installed = await fileExists(comfyDir)
  const pythonPath = await findComfyPython()
  return new Response(
    JSON.stringify({ installed, pythonAvailable: Boolean(pythonPath) }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
