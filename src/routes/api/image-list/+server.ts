import { json } from '@sveltejs/kit'
import fs from 'fs/promises'
import path from 'path'
import { DEFAULT_OUTPUT_DIRECTORY } from '$lib/constants'
import { getTodayDate } from '$lib/utils/date'

export async function GET({ url }) {
  try {
    const outputDirectory = url.searchParams.get('outputDirectory') || DEFAULT_OUTPUT_DIRECTORY
    const outputDir = path.resolve(process.cwd(), outputDirectory)
    
    // Check if output directory exists
    try {
      await fs.access(outputDir)
    } catch {
      // If directory doesn't exist, return empty list
      return json({
        success: true,
        files: []
      })
    }

    const imageFiles: string[] = []
    
    // Check today's date folder first
    const todayFolder = getTodayDate()
    const todayFolderPath = path.join(outputDir, todayFolder)
    
    try {
      await fs.access(todayFolderPath)
      const todayFiles = await fs.readdir(todayFolderPath)
      const todayImageFiles = todayFiles
        .filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file))
        .map(file => path.join(todayFolderPath, file))
      imageFiles.push(...todayImageFiles)
    } catch {
      // Today's folder doesn't exist yet, that's fine
    }
    
    // Sort by full path (which will be chronological due to date folders and time filenames)
    imageFiles.sort()
    
    return json({
      success: true,
      files: imageFiles
    })
  } catch (error) {
    console.error('Error reading output directory:', error)
    return json({ error: 'Failed to read output directory' }, { status: 500 })
  }
}