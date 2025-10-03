import { json, type RequestEvent } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'

const workflowDir = path.resolve(process.cwd(), 'data', 'workflow')

function sanitizeFilename(name: string): string {
  // Allow only basename to avoid path traversal
  const base = path.basename(name)
  // Reject anything that resolves to empty or attempts directory tricks
  return base
}

export async function GET({ url }: RequestEvent) {
  // If no name parameter, return list of workflow files
  const name = url.searchParams.get('name')

  if (!name) {
    try {
      // Ensure workflow directory exists
      await fs.mkdir(workflowDir, { recursive: true })

      // Read all files from workflow directory
      const files = await fs.readdir(workflowDir)

      // Filter for JSON files only
      const jsonFiles = files.filter((file) => file.endsWith('.json'))

      return json({ workflows: jsonFiles })
    } catch (error) {
      console.error('Failed to list workflow files:', error)
      return json({ workflows: [] })
    }
  }

  // If name parameter provided, return specific workflow
  try {
    const safeName = sanitizeFilename(name)
    if (!safeName) return json({ error: 'Invalid filename' }, { status: 400 })

    const filePath = path.join(workflowDir, safeName)
    const content = await fs.readFile(filePath, 'utf-8')
    const workflow = JSON.parse(content)
    return json({ workflow })
  } catch (error) {
    console.error('Failed to read workflow file:', error)
    return json({ error: 'Failed to read workflow file' }, { status: 404 })
  }
}
