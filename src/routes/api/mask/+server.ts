import { json } from '@sveltejs/kit'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { maskData } = await request.json()
    
    if (!maskData || typeof maskData !== 'string') {
      return json({ error: 'Invalid mask data' }, { status: 400 })
    }

    // Save to static directory for web access
    const staticDir = join(process.cwd(), 'static')
    await mkdir(staticDir, { recursive: true })

    // Use single temporary mask file
    const filename = 'temp_mask.png'
    const filepath = join(staticDir, filename)

    // Convert base64 to buffer and save
    const base64Data = maskData.replace(/^data:image\/png;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    
    await writeFile(filepath, buffer)

    return json({ 
      success: true, 
      filename,
      filepath: filepath.replace(/\\/g, '/')
    })
  } catch (error) {
    console.error('Error saving mask:', error)
    return json({ error: 'Failed to save mask' }, { status: 500 })
  }
}