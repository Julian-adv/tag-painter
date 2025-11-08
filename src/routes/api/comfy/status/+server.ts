import type { RequestHandler } from '@sveltejs/kit'
import { getComfyDir, fileExists, findComfyPython } from '$lib/server/comfy'
import { isComfyAvailable } from '$lib/server/comfyProcess'

export const GET: RequestHandler = async () => {
  const comfyDir = getComfyDir()
  const installed = await fileExists(comfyDir)
  const pythonPath = await findComfyPython()
  const running = await isComfyAvailable()
  return new Response(
    JSON.stringify({ installed, pythonAvailable: Boolean(pythonPath), running }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
