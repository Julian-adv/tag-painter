import { json } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'
import { DEFAULT_COMFY_URL, DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'

const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'settings.json')

export async function GET() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(SETTINGS_FILE)
    await fs.mkdir(dataDir, { recursive: true })

    // Check if settings file exists
    try {
      await fs.access(SETTINGS_FILE)
    } catch {
      // File doesn't exist, return default settings
      return json({
        success: true,
        settings: {
          imageWidth: 832,
          imageHeight: 1216,
          cfgScale: 5,
          steps: 28,
          seed: -1,
          sampler: 'euler_ancestral',
          comfyUrl: DEFAULT_COMFY_URL,
          outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
          selectedVae: '__embedded__',
          clipSkip: 2,
          perModel: {}
        }
      })
    }

    // Read existing settings
    const settingsData = await fs.readFile(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(settingsData)

    // Ensure clipSkip exists with default value
    if (settings.clipSkip == null) {
      settings.clipSkip = 2
    }

    if (!settings.comfyUrl) {
      settings.comfyUrl = DEFAULT_COMFY_URL
    }

    return json({
      success: true,
      settings
    })
  } catch (error) {
    console.error('Error reading settings:', error)
    return json({ success: false, error: 'Failed to read settings' }, { status: 500 })
  }
}

export async function POST({ request }) {
  try {
    const settings = await request.json()

    // Ensure data directory exists
    const dataDir = path.dirname(SETTINGS_FILE)
    await fs.mkdir(dataDir, { recursive: true })

    // Save settings to file
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')

    return json({
      success: true,
      message: 'Settings saved successfully'
    })
  } catch (error) {
    console.error('Error saving settings:', error)
    return json({ success: false, error: 'Failed to save settings' }, { status: 500 })
  }
}
