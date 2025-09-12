import { json } from '@sveltejs/kit'
import { spawn } from 'child_process'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'

export async function POST({ request }) {
  try {
    const { folderPath } = await request.json()

    if (!folderPath || typeof folderPath !== 'string') {
      return json({ error: 'Invalid folder path' }, { status: 400 })
    }

    // Resolve to absolute path from project root
    const absolutePath = path.resolve(folderPath)

    // Check if directory exists, if not create it
    if (!existsSync(absolutePath)) {
      try {
        mkdirSync(absolutePath, { recursive: true })
      } catch (error) {
        console.error('Failed to create directory:', error)
        return json({ error: 'Failed to create directory' }, { status: 500 })
      }
    }

    // Determine the command and args based on the operating system
    let command: string
    let args: string[]
    const platform = process.platform

    switch (platform) {
      case 'win32':
        // Windows: use explorer
        command = 'explorer'
        args = [absolutePath]
        break
      case 'darwin':
        // macOS: use open
        command = 'open'
        args = [absolutePath]
        break
      case 'linux':
        // Linux: use xdg-open (works with most desktop environments)
        command = 'xdg-open'
        args = [absolutePath]
        break
      default:
        return json({ error: `Unsupported platform: ${platform}` }, { status: 400 })
    }

    // Execute the command using spawn (fire and forget)
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    })

    // Don't wait for the process, just detach it
    child.unref()

    return json({ success: true, message: 'Folder opened successfully' })
  } catch (error) {
    console.error('Error opening folder:', error)
    return json({ error: 'Failed to open folder' }, { status: 500 })
  }
}
