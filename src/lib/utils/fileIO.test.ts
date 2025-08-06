import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  savePrompts,
  loadPrompts,
  saveImage,
  getImageUrl,
  getImageMetadata,
  getImageList,
  loadSettings,
  saveSettings
} from './fileIO'
import type { PromptsData, Settings } from '$lib/types'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('fileIO utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('savePrompts', () => {
    it('should save prompts successfully', async () => {
      const mockData: Partial<PromptsData> = {
        categories: []
      }

      mockFetch.mockResolvedValueOnce({
        ok: true
      })

      await savePrompts(mockData as PromptsData)

      expect(mockFetch).toHaveBeenCalledWith('/api/prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mockData)
      })
    })

    it('should handle save prompts error gracefully', async () => {
      const mockData: Partial<PromptsData> = {
        categories: []
      }

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      // Should not throw error
      await expect(savePrompts(mockData as PromptsData)).resolves.toBeUndefined()
    })
  })

  describe('loadPrompts', () => {
    it('should load prompts successfully', async () => {
      const mockData: Partial<PromptsData> = {
        categories: [
          { name: 'test', values: [], currentValue: { title: '', value: '' } }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      const result = await loadPrompts()

      expect(mockFetch).toHaveBeenCalledWith('/api/prompts')
      expect(result).toEqual(mockData)
    })

    it('should return null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      })

      const result = await loadPrompts()

      expect(result).toBeNull()
    })

    it('should return null when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await loadPrompts()

      expect(result).toBeNull()
    })
  })

  describe('saveImage', () => {
    it('should save image successfully', async () => {
      const mockImageBlob = new Blob(['fake image data'], { type: 'image/png' })
      const mockPrompts = {
        all: 'all prompts',
        zone1: 'zone1 prompts',
        zone2: 'zone2 prompts',
        negative: 'negative prompts'
      }
      const mockOutputDirectory = '/test/output'
      const mockWorkflow = { node1: { type: 'test' } }
      const mockSeed = 12345
      const expectedFilePath = '/test/output/generated-123.png'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ filePath: expectedFilePath })
      })

      const result = await saveImage(mockImageBlob, mockPrompts, mockOutputDirectory, mockWorkflow, mockSeed)

      expect(mockFetch).toHaveBeenCalledWith('/api/image', {
        method: 'POST',
        body: expect.any(FormData)
      })

      // Check FormData contents
      const formData = mockFetch.mock.calls[0][1].body as FormData
      expect(formData.get('image')).toBeInstanceOf(Blob)
      expect(formData.get('allPrompt')).toBe('all prompts')
      expect(formData.get('zone1Prompt')).toBe('zone1 prompts')
      expect(formData.get('zone2Prompt')).toBe('zone2 prompts')
      expect(formData.get('negativePrompt')).toBe('negative prompts')
      expect(formData.get('seed')).toBe('12345')
      expect(formData.get('outputDirectory')).toBe('/test/output')
      expect(formData.get('workflow')).toBe(JSON.stringify(mockWorkflow))

      expect(result).toBe(expectedFilePath)
    })

    it('should return null when save fails', async () => {
      const mockImageBlob = new Blob(['fake image data'], { type: 'image/png' })
      const mockPrompts = {
        all: 'all prompts',
        zone1: 'zone1 prompts',
        zone2: 'zone2 prompts',
        negative: 'negative prompts'
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Save failed' })
      })

      const result = await saveImage(mockImageBlob, mockPrompts, '/test/output', {}, 12345)

      expect(result).toBeNull()
    })

    it('should return null when fetch throws error', async () => {
      const mockImageBlob = new Blob(['fake image data'], { type: 'image/png' })
      const mockPrompts = {
        all: 'all prompts',
        zone1: 'zone1 prompts',
        zone2: 'zone2 prompts',
        negative: 'negative prompts'
      }

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await saveImage(mockImageBlob, mockPrompts, '/test/output', {}, 12345)

      expect(result).toBeNull()
    })
  })

  describe('getImageUrl', () => {
    it('should return correct image URL', () => {
      const imagePath = '/test/path/image.png'
      const result = getImageUrl(imagePath)

      expect(result).toBe('/api/image?path=%2Ftest%2Fpath%2Fimage.png')
    })

    it('should handle special characters in path', () => {
      const imagePath = '/test/path with spaces/image&test.png'
      const result = getImageUrl(imagePath)

      expect(result).toBe('/api/image?path=%2Ftest%2Fpath%20with%20spaces%2Fimage%26test.png')
    })
  })

  describe('getImageMetadata', () => {
    it('should get image metadata successfully', async () => {
      const mockMetadata = { parameters: 'test parameters', workflow: {} }
      const imagePath = '/test/image.png'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ metadata: mockMetadata })
      })

      const result = await getImageMetadata(imagePath)

      expect(mockFetch).toHaveBeenCalledWith('/api/image?path=%2Ftest%2Fimage.png&metadata=true')
      expect(result).toEqual(mockMetadata)
    })

    it('should return null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      })

      const result = await getImageMetadata('/test/image.png')

      expect(result).toBeNull()
    })

    it('should return null when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await getImageMetadata('/test/image.png')

      expect(result).toBeNull()
    })
  })

  describe('getImageList', () => {
    it('should get image list successfully', async () => {
      const mockFiles = ['image1.png', 'image2.png', 'image3.png']
      const outputDirectory = '/test/output'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ files: mockFiles })
      })

      const result = await getImageList(outputDirectory)

      expect(mockFetch).toHaveBeenCalledWith('/api/image-list?outputDirectory=%2Ftest%2Foutput')
      expect(result).toEqual(mockFiles)
    })

    it('should return empty array when files property is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      })

      const result = await getImageList('/test/output')

      expect(result).toEqual([])
    })

    it('should return empty array when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      })

      const result = await getImageList('/test/output')

      expect(result).toEqual([])
    })

    it('should return empty array when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await getImageList('/test/output')

      expect(result).toEqual([])
    })
  })

  describe('loadSettings', () => {
    it('should load settings successfully', async () => {
      const mockSettings: Settings = {
        imageWidth: 832,
        imageHeight: 1216,
        cfgScale: 7,
        steps: 20,
        seed: -1,
        sampler: 'euler',
        outputDirectory: '/test/output'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ settings: mockSettings })
      })

      const result = await loadSettings()

      expect(mockFetch).toHaveBeenCalledWith('/api/settings')
      expect(result).toEqual(mockSettings)
    })

    it('should return null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      })

      const result = await loadSettings()

      expect(result).toBeNull()
    })

    it('should return null when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await loadSettings()

      expect(result).toBeNull()
    })
  })

  describe('saveSettings', () => {
    it('should save settings successfully', async () => {
      const mockSettings = {
        imageWidth: 832,
        imageHeight: 1216,
        cfgScale: 7
      }

      mockFetch.mockResolvedValueOnce({
        ok: true
      })

      const result = await saveSettings(mockSettings)

      expect(mockFetch).toHaveBeenCalledWith('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mockSettings)
      })
      expect(result).toBe(true)
    })

    it('should return false when save fails', async () => {
      const mockSettings = { imageWidth: 832 }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Save failed' })
      })

      const result = await saveSettings(mockSettings)

      expect(result).toBe(false)
    })

    it('should return false when fetch throws error', async () => {
      const mockSettings = { imageWidth: 832 }

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await saveSettings(mockSettings)

      expect(result).toBe(false)
    })
  })
})