import type { RequestHandler } from '@sveltejs/kit'
import { checkStep1FilesExist } from '$lib/server/downloads/manager'

export const GET: RequestHandler = async () => {
  try {
    const result = await checkStep1FilesExist()
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check files'
    return new Response(JSON.stringify({ error: message, allExist: false, missingFilenames: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
