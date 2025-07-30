// API for prompts storage and retrieval

import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { PromptsData, PromptCategory } from '$lib/types';

const dataDir = path.resolve(process.cwd(), 'data')
const filePath = path.join(dataDir, 'prompts.json')

// Ensure the data directory exists
async function ensureDir() {
  try {
    await fs.mkdir(dataDir, { recursive: true })
  } catch (error) {
    console.error('Error creating data directory:', error)
  }
}

// Clean category data to remove unnecessary fields
function cleanCategoryData(category: PromptCategory): PromptCategory {
  const cleaned: PromptCategory = {
    id: category.id,
    name: category.name,
    values: category.aliasOf ? [] : category.values, // Empty array if it's an alias
    currentValue: category.currentValue
  }
  
  // Include aliasOf if it exists
  if (category.aliasOf) {
    cleaned.aliasOf = category.aliasOf
  }
  
  return cleaned
}

export async function POST({ request }) {
  await ensureDir()
  const data: PromptsData = await request.json()

  try {
    // Clean the data to remove unnecessary fields like placeholder, rows, etc.
    const cleanedData: PromptsData = {
      categories: data.categories.map(cleanCategoryData),
      tags: data.tags || { all: [], zone1: [], zone2: [], negative: [] },
      selectedCheckpoint: data.selectedCheckpoint,
      selectedComposition: data.selectedComposition || 'left-horizontal',
      useUpscale: data.useUpscale,
      useFaceDetailer: data.useFaceDetailer,
      selectedLoras: data.selectedLoras,
      loraWeight: data.loraWeight
    }
    
    await fs.writeFile(filePath, JSON.stringify(cleanedData, null, 2))
    return json({ success: true })
  } catch (error) {
    console.error('Error writing to file:', error)
    return json({ success: false, error: 'Failed to save data' }, { status: 500 })
  }
}

function createDefaultCategories(): PromptCategory[] {
  return [
    {
      id: 'quality',
      name: 'Quality',
      values: [],
      currentValue: { title: '', value: '' }
    },
    {
      id: 'character',
      name: 'Character',
      values: [],
      currentValue: { title: '', value: '' }
    },
    {
      id: 'outfit',
      name: 'Outfit',
      values: [],
      currentValue: { title: '', value: '' }
    },
    {
      id: 'pose',
      name: 'Pose',
      values: [],
      currentValue: { title: '', value: '' }
    },
    {
      id: 'backgrounds',
      name: 'Backgrounds',
      values: [],
      currentValue: { title: '', value: '' }
    },
    {
      id: 'negative',
      name: 'Negative',
      values: [],
      currentValue: { title: '', value: '' }
    }
  ]
}


export async function GET() {
  await ensureDir()
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    const parsedData = JSON.parse(data)
    return json(parsedData)
  } catch (error) {
    // If the file doesn't exist, return a default structure
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      const defaultPrompts: PromptsData = {
        categories: createDefaultCategories(),
        tags: { all: [], zone1: [], zone2: [], negative: [] },
        selectedCheckpoint: null,
        selectedComposition: 'left-horizontal',
        useUpscale: true,
        useFaceDetailer: true,
        selectedLoras: [],
        loraWeight: 0.8
      }
      return json(defaultPrompts)
    }
    console.error('Error reading file:', error)
    return json({ error: 'Failed to read data' }, { status: 500 })
  }
}
