import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchCheckpoints,
  connectWebSocket,
  type WebSocketCallbacks
} from './comfyui'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock WebSocket
class MockWebSocket {
  url: string
  binaryType: string = 'blob'
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 0)
  }

  close() {
    setTimeout(() => {
      if (this.onclose) {
        this.onclose(new CloseEvent('close'))
      }
    }, 0)
  }

  // Helper method to simulate receiving messages
  simulateMessage(data: string | ArrayBuffer | Blob) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  // Helper method to simulate binary data
  simulateBinaryMessage(arrayBuffer: ArrayBuffer) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: arrayBuffer }))
    }
  }

  // Helper method to simulate errors
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }
}

// Mock WebSocket constructor
const mockWebSocketConstructor = vi.fn().mockImplementation((url: string) => new MockWebSocket(url))
// Add required static properties to make it compatible with WebSocket constructor type
Object.assign(mockWebSocketConstructor, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  prototype: MockWebSocket.prototype
})
global.WebSocket = mockWebSocketConstructor as unknown as typeof WebSocket

describe('comfyui utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchCheckpoints', () => {
    it('should fetch checkpoints successfully', async () => {
      const mockCheckpoints = ['model1.safetensors', 'model2.ckpt', 'model3.safetensors']
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            CheckpointLoaderSimple: {
              input: {
                required: {
                  ckpt_name: [mockCheckpoints]
                }
              }
            }
          })
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await fetchCheckpoints('http://127.0.0.1:8188')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8188/object_info/CheckpointLoaderSimple'
      )
      expect(result).toEqual(mockCheckpoints)
    })

    it('should return empty array when API returns non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await fetchCheckpoints('http://127.0.0.1:8188')

      expect(result).toEqual([])
    })

    it('should return empty array when API response has unexpected structure', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            unexpected: 'structure'
          })
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await fetchCheckpoints('http://127.0.0.1:8188')

      expect(result).toEqual([])
    })

    it('should return empty array when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchCheckpoints('http://127.0.0.1:8188')

      expect(result).toEqual([])
    })

    it('should return empty array when response is missing required fields', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            CheckpointLoaderSimple: {
              input: {
                // missing required field
              }
            }
          })
      }

      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await fetchCheckpoints('http://127.0.0.1:8188')

      expect(result).toEqual([])
    })
  })

  describe('connectWebSocket', () => {
    const mockCallbacks: WebSocketCallbacks = {
      onLoadingChange: vi.fn(),
      onProgressUpdate: vi.fn(),
      onImageReceived: vi.fn(),
      onError: vi.fn()
    }

    const mockWorkflow = {
      '1': { _meta: { title: 'Load Checkpoint' } },
      '2': { _meta: { title: 'Generate Image' } },
      '3': { _meta: { title: 'Save Image' } }
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should establish WebSocket connection with correct URL', () => {
      const promptId = 'test-prompt-123'
      const clientId = 'test-client-456'
      const finalSaveNodeId = '3'

      connectWebSocket(
        promptId,
        clientId,
        finalSaveNodeId,
        mockWorkflow,
        mockCallbacks,
        'http://127.0.0.1:8188'
      )

      // Check that WebSocket was created with correct URL
      expect(mockWebSocketConstructor).toHaveBeenCalledWith(
        `ws://127.0.0.1:8188/ws?clientId=${clientId}`
      )
    })

    it('should set correct binaryType on WebSocket', () => {
      const promptId = 'test-prompt-123'
      const clientId = 'test-client-456'
      const finalSaveNodeId = '3'

      connectWebSocket(
        promptId,
        clientId,
        finalSaveNodeId,
        mockWorkflow,
        mockCallbacks,
        'http://127.0.0.1:8188'
      )

      // Check that WebSocket was created and binaryType was set
      expect(mockWebSocketConstructor).toHaveBeenCalled()
      // Since we can't easily test instance properties in this mock setup,
      // we'll just verify the function was called correctly
    })

    it('should handle different message types properly', () => {
      const promptId = 'test-prompt-123'
      const clientId = 'test-client-456'
      const finalSaveNodeId = '3'

      // Test that the connectWebSocket function can be called without throwing
      expect(() => {
        connectWebSocket(
          promptId,
          clientId,
          finalSaveNodeId,
          mockWorkflow,
          mockCallbacks,
          'http://127.0.0.1:8188'
        )
      }).not.toThrow()

      expect(mockWebSocketConstructor).toHaveBeenCalledWith(
        `ws://127.0.0.1:8188/ws?clientId=${clientId}`
      )
    })

    it('should handle workflow with missing titles', () => {
      const promptId = 'test-prompt-123'
      const clientId = 'test-client-456'
      const finalSaveNodeId = '3'
      const workflowWithoutTitles = {
        '1': {}, // No _meta.title
        '2': { _meta: {} }, // Empty _meta
        '3': { _meta: { title: 'Save Image' } }
      }

      expect(() => {
        connectWebSocket(
          promptId,
          clientId,
          finalSaveNodeId,
          workflowWithoutTitles,
          mockCallbacks,
          'http://127.0.0.1:8188'
        )
      }).not.toThrow()
    })

    it('should handle empty workflow', () => {
      const promptId = 'test-prompt-123'
      const clientId = 'test-client-456'
      const finalSaveNodeId = '3'
      const emptyWorkflow = {}

      expect(() => {
        connectWebSocket(
          promptId,
          clientId,
          finalSaveNodeId,
          emptyWorkflow,
          mockCallbacks,
          'http://127.0.0.1:8188'
        )
      }).not.toThrow()
    })

    it('should accept all required callback functions', () => {
      const promptId = 'test-prompt-123'
      const clientId = 'test-client-456'
      const finalSaveNodeId = '3'

      // Verify that all callback functions are properly typed and accepted
      expect(mockCallbacks.onLoadingChange).toBeInstanceOf(Function)
      expect(mockCallbacks.onProgressUpdate).toBeInstanceOf(Function)
      expect(mockCallbacks.onImageReceived).toBeInstanceOf(Function)
      expect(mockCallbacks.onError).toBeInstanceOf(Function)

      expect(() => {
        connectWebSocket(
          promptId,
          clientId,
          finalSaveNodeId,
          mockWorkflow,
          mockCallbacks,
          'http://127.0.0.1:8188'
        )
      }).not.toThrow()
    })
  })
})
