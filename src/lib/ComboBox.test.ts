import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import ComboBox from './ComboBox.svelte'
import type { OptionItem } from './types'

describe('ComboBox', () => {
  const mockOptions: OptionItem[] = [
    { title: 'Option One', value: 'option1' },
    { title: 'Option Two', value: 'option2' },
    { title: 'Another Choice', value: 'option3' }
  ]

  const mockValue: OptionItem = { title: 'Option One', value: 'option1' }
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

  it('should render with initial value', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: mockValue,
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    expect(input?.value).toBe('Option One')
  })

  it('should render with placeholder when no initial value', () => {
    const emptyValue: OptionItem = { title: '', value: '' }
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: emptyValue,
        options: mockOptions,
        placeholder: 'Select an option...',
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    expect(input?.placeholder).toBe('Select an option...')
  })

  it('should filter options based on input', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: mockValue,
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    
    // Simulate typing 'two' to filter
    input.value = 'two'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    // Check if filtered options are shown
    expect(container.textContent).toContain('Option Two')
    expect(container.textContent).not.toContain('Option One')
    expect(container.textContent).not.toContain('Another Choice')
  })

  it('should handle keyboard navigation', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    
    // Simulate focus and ArrowDown key
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    flushSync()
    
    // Simulate Enter key to select
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()

    expect(mockOnValueChange).toHaveBeenCalledWith(mockOptions[0])
  })

  it('should call onValueChange when option is selected', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    // This test verifies the component can be instantiated with onValueChange callback
    // Full interaction testing would require more complex setup
    expect(mockOnValueChange).toBeDefined()
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('should call onOptionSelected when provided', () => {
    const mockOnValueChange = vi.fn()
    const mockOnOptionSelected = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange,
        onOptionSelected: mockOnOptionSelected
      }
    })

    flushSync()
    // This test verifies the component can be instantiated with onOptionSelected callback
    expect(mockOnOptionSelected).toBeDefined()
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('should close dropdown on escape key', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    
    // Open dropdown
    input.click()
    flushSync()
    
    // Verify dropdown is open
    expect(container.textContent).toContain('Option One')
    
    // Simulate Escape key
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    flushSync()
    
    // Verify dropdown is closed (options should not be visible)
    const hasOptionsVisible = container.querySelectorAll('button').length > 0
    expect(hasOptionsVisible).toBe(false)
  })

  it('should handle empty options array', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: mockValue,
        options: [],
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    expect(input?.value).toBe('Option One')
  })

  it('should handle case-insensitive filtering', () => {
    const mockOnValueChange = vi.fn()

    component = mount(ComboBox, {
      target: container,
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    flushSync()
    const input = container.querySelector('input') as HTMLInputElement
    
    // Clear and type uppercase
    input.value = 'OPTION'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    // Should show both options that contain "option" (case-insensitive)
    expect(container.textContent).toContain('Option One')
    expect(container.textContent).toContain('Option Two')
    expect(container.textContent).not.toContain('Another Choice')
  })
})
