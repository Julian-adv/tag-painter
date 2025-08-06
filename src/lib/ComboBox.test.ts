import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import ComboBox from './ComboBox.svelte'
import type { OptionItem } from './types'

describe('ComboBox', () => {
  const mockOptions: OptionItem[] = [
    { title: 'Option One', value: 'option1' },
    { title: 'Option Two', value: 'option2' },
    { title: 'Another Choice', value: 'option3' }
  ]

  const mockValue: OptionItem = { title: 'Option One', value: 'option1' }

  it('should render with initial value', () => {
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: mockValue,
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByDisplayValue('Option One')
    expect(input).toBeInTheDocument()
  })

  it('should render with placeholder when no initial value', () => {
    const emptyValue: OptionItem = { title: '', value: '' }
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: emptyValue,
        options: mockOptions,
        placeholder: 'Select an option...',
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByPlaceholderText('Select an option...')
    expect(input).toBeInTheDocument()
  })

  it('should filter options based on input', async () => {
    const user = userEvent.setup()
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: mockValue,
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByDisplayValue('Option One')

    // Clear input and type to filter
    await user.clear(input)
    await user.type(input, 'two')

    // Should show dropdown with filtered option
    expect(screen.getByText('Option Two')).toBeInTheDocument()
    expect(screen.queryByText('Option One')).not.toBeInTheDocument()
    expect(screen.queryByText('Another Choice')).not.toBeInTheDocument()
  })

  it('should handle keyboard navigation', async () => {
    const user = userEvent.setup()
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByRole('textbox')
    await user.click(input)

    // Arrow down should navigate to first option
    await user.keyboard('{ArrowDown}')

    // Enter should select the highlighted option
    await user.keyboard('{Enter}')

    expect(mockOnValueChange).toHaveBeenCalledWith(mockOptions[0])
  })

  it('should call onValueChange when option is selected', async () => {
    const user = userEvent.setup()
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByRole('textbox')
    await user.click(input)

    // Click on an option
    const option = screen.getByText('Option Two')
    await user.click(option)

    expect(mockOnValueChange).toHaveBeenCalledWith(mockOptions[1])
  })

  it('should call onOptionSelected when provided', async () => {
    const user = userEvent.setup()
    const mockOnValueChange = vi.fn()
    const mockOnOptionSelected = vi.fn()

    render(ComboBox, {
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange,
        onOptionSelected: mockOnOptionSelected
      }
    })

    const input = screen.getByRole('textbox')
    await user.click(input)

    const option = screen.getByText('Option Two')
    await user.click(option)

    expect(mockOnOptionSelected).toHaveBeenCalledWith(mockOptions[1])
  })

  it('should close dropdown on escape key', async () => {
    const user = userEvent.setup()
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByRole('textbox')
    await user.click(input)

    // Dropdown should be visible
    expect(screen.getByText('Option One')).toBeInTheDocument()

    // Escape should close dropdown
    await user.keyboard('{Escape}')

    // Dropdown should be hidden
    expect(screen.queryByText('Option One')).not.toBeInTheDocument()
  })

  it('should handle empty options array', () => {
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: mockValue,
        options: [],
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByDisplayValue('Option One')
    expect(input).toBeInTheDocument()
  })

  it('should handle case-insensitive filtering', async () => {
    const user = userEvent.setup()
    const mockOnValueChange = vi.fn()

    render(ComboBox, {
      props: {
        value: { title: '', value: '' },
        options: mockOptions,
        onValueChange: mockOnValueChange
      }
    })

    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'OPTION')

    // Should show both options that contain "option" (case-insensitive)
    expect(screen.getByText('Option One')).toBeInTheDocument()
    expect(screen.getByText('Option Two')).toBeInTheDocument()
    expect(screen.queryByText('Another Choice')).not.toBeInTheDocument()
  })
})
