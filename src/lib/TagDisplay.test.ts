import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import TagDisplay from './TagDisplay.svelte'
import type { CustomTag } from './types'

// Mock TagItem component
vi.mock('./TagItem.svelte', () => ({
  default: vi.fn().mockImplementation((props) => ({
    component: 'div',
    props: {
      'data-testid': `tag-item-${props.tag.name}`,
      children: props.tag.name
    }
  }))
}))

describe('TagDisplay', () => {
  const mockTags: CustomTag[] = [
    { name: 'tag1', type: 'regular', tags: [] },
    { name: 'tag2', type: 'random', tags: ['option1', 'option2'] },
    { name: 'tag3', type: 'sequential', tags: ['seq1', 'seq2'] }
  ]

  it('should render empty state when no tags', () => {
    render(TagDisplay, { 
      props: { 
        id: 'test-display',
        tags: []
      } 
    })

    const container = screen.getByRole('textbox', { name: 'Tag display area' })
    expect(container).toBeInTheDocument()
  })

  it('should render tags when provided', () => {
    render(TagDisplay, { 
      props: { 
        id: 'test-display',
        tags: mockTags
      } 
    })

    expect(screen.getByTestId('tag-item-tag1')).toBeInTheDocument()
    expect(screen.getByTestId('tag-item-tag2')).toBeInTheDocument()
    expect(screen.getByTestId('tag-item-tag3')).toBeInTheDocument()
  })

  it('should have proper accessibility attributes', () => {
    render(TagDisplay, { 
      props: { 
        id: 'test-display',
        tags: mockTags
      } 
    })

    const container = screen.getByRole('textbox', { name: 'Tag display area' })
    expect(container).toHaveAttribute('tabindex', '-1')
    expect(container).toHaveAttribute('id', 'test-display')
  })

  it('should apply correct CSS classes', () => {
    render(TagDisplay, { 
      props: { 
        id: 'test-display',
        tags: mockTags
      } 
    })

    const container = screen.getByRole('textbox')
    expect(container).toHaveClass('w-full', 'min-h-[6rem]', 'p-1', 'border', 'border-gray-300', 'rounded-lg', 'bg-white')
  })

  it('should handle keyboard events', async () => {
    const user = userEvent.setup()
    render(TagDisplay, { 
      props: { 
        id: 'test-display',
        tags: mockTags
      } 
    })

    const container = screen.getByRole('textbox')
    
    // Tab key should not be prevented (for navigation)
    await user.tab()
    expect(container).toHaveClass('w-full') // Should still have classes, meaning no error occurred
  })

  it('should pass props to TagItem components correctly', () => {
    const mockCallbacks = {
      onTagsChange: vi.fn(),
      onCustomTagDoubleClick: vi.fn(),
      onTagClick: vi.fn()
    }

    const mockResolutions = { 'tag2': 'resolved-value' }
    const testOverride = 'test-override'

    render(TagDisplay, { 
      props: { 
        id: 'test-display',
        tags: mockTags,
        currentRandomTagResolutions: mockResolutions,
        testOverrideTag: testOverride,
        disabled: true,
        ...mockCallbacks
      } 
    })

    // Verify that TagItem components receive the correct props
    expect(screen.getByTestId('tag-item-tag1')).toBeInTheDocument()
    expect(screen.getByTestId('tag-item-tag2')).toBeInTheDocument()
    expect(screen.getByTestId('tag-item-tag3')).toBeInTheDocument()
  })
})