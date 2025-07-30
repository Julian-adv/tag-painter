import { json } from '@sveltejs/kit'
import path from 'path'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  try {
    const composition = url.searchParams.get('composition')
    if (!composition) {
      return json({ error: 'Composition parameter is required' }, { status: 400 })
    }

    // Generate absolute path for the mask image based on composition
    const maskImagePath = path.resolve(process.cwd(), 'static', `${composition}-mask.png`)
    
    return json({ maskImagePath })
  } catch (error) {
    console.error('Error resolving mask path:', error)
    return json({ error: 'Failed to resolve mask path' }, { status: 500 })
  }
}