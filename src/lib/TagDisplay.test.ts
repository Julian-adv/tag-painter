import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import TagDisplay from './TagDisplay.svelte'
import type { CustomTag } from './types'

describe('TagDisplay', () => {
  const mockTags: CustomTag[] = [
    { name: 'tag1', type: 'regular', tags: [] },
    { name: 'tag2', type: 'random', tags: ['option1', 'option2'] },
    { name: 'tag3', type: 'sequential', tags: ['seq1', 'seq2'] }
  ]

  let container: HTMLElement
  let component: any

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    if (component) {
      unmount(component)
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('should render empty state when no tags', () => {
    component = mount(TagDisplay, {
      target: container,
      props: {
        id: 'test-display',
        tags: []
      }
    })

    flushSync()
    const textbox = container.querySelector('[role="textbox"]')
    expect(textbox).toBeTruthy()
  })

  it('should render tags when provided', () => {
    component = mount(TagDisplay, {
      target: container,
      props: {
        id: 'test-display',
        tags: mockTags
      }
    })

    flushSync()
    // Check if tag names are present in the rendered content
    expect(container.textContent).toContain('tag1')
    expect(container.textContent).toContain('tag2')
    expect(container.textContent).toContain('tag3')
  })

  it('should have proper accessibility attributes', () => {
    component = mount(TagDisplay, {
      target: container,
      props: {
        id: 'test-display',
        tags: mockTags
      }
    })

    flushSync()
    const textbox = container.querySelector('[role="textbox"]') as HTMLElement
    expect(textbox?.getAttribute('tabindex')).toBe('-1')
    expect(textbox?.getAttribute('id')).toBe('test-display')
  })

  it('should apply correct CSS classes', () => {
    component = mount(TagDisplay, {
      target: container,
      props: {
        id: 'test-display',
        tags: mockTags
      }
    })

    flushSync()
    const textbox = container.querySelector('[role="textbox"]') as HTMLElement
    expect(textbox?.className).toContain('w-full')
    expect(textbox?.className).toContain('min-h-')
    expect(textbox?.className).toContain('border')
  })

  it('should handle keyboard events', () => {
    component = mount(TagDisplay, {
      target: container,
      props: {
        id: 'test-display',
        tags: mockTags
      }
    })

    flushSync()
    const textbox = container.querySelector('[role="textbox"]') as HTMLElement

    // Simulate Tab key press
    textbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    flushSync()

    // Should still have classes, meaning no error occurred
    expect(textbox?.className).toContain('w-full')
  })

  it('should pass props to TagItem components correctly', () => {
    const mockCallbacks = {
      onTagsChange: vi.fn(),
      onCustomTagDoubleClick: vi.fn(),
      onTagClick: vi.fn()
    }

    const mockResolutions = { tag2: 'resolved-value' }
    const testOverride = 'test-override'

    component = mount(TagDisplay, {
      target: container,
      props: {
        id: 'test-display',
        tags: mockTags,
        currentRandomTagResolutions: mockResolutions,
        testOverrideTag: testOverride,
        disabled: true,
        ...mockCallbacks
      }
    })

    flushSync()
    // Verify that tag components are rendered with correct content
    expect(container.textContent).toContain('tag1')
    expect(container.textContent).toContain('tag2')
    expect(container.textContent).toContain('tag3')
  })
})
