import { describe, it, expect } from 'vitest'

/**
 * Test helper function that mimics the LoRA insertion logic
 */
function insertLoraIntoValue(currentValue: string, loraName: string): string {
  // Extract last component of path and remove .safetensors extension
  const processedLoraName =
    loraName.split('/').pop()?.replace(/\.safetensors$/i, '') || loraName
  const loraTag = `<lora:${processedLoraName}>`
  const trimmed = currentValue.trim()

  // Parse the value to insert LoRA before disables directive
  const disablesMatch = trimmed.match(/(.*?)(,?\s*disables=\[[^\]]*\])(.*)$/i)

  if (disablesMatch) {
    // Insert before disables directive
    const beforeDisables = disablesMatch[1].trim()
    const disablesDirective = disablesMatch[2].trim()
    const afterDisables = disablesMatch[3].trim()

    // Remove leading comma from disablesDirective if present
    const cleanDisables = disablesDirective.replace(/^,\s*/, '')

    if (beforeDisables) {
      return `${beforeDisables}, ${loraTag}, ${cleanDisables}${afterDisables ? ' ' + afterDisables : ''}`
    } else {
      return `${loraTag}, ${cleanDisables}${afterDisables ? ' ' + afterDisables : ''}`
    }
  } else {
    // No disables directive, just append
    return trimmed ? `${trimmed}, ${loraTag}` : loraTag
  }
}

describe('LoRA insertion', () => {
  it('should insert LoRA into empty value', () => {
    const result = insertLoraIntoValue('', 'test_lora')
    expect(result).toBe('<lora:test_lora>')
  })

  it('should append LoRA to simple value without disables', () => {
    const result = insertLoraIntoValue('some tags', 'test_lora')
    expect(result).toBe('some tags, <lora:test_lora>')
  })

  it('should insert LoRA before disables directive', () => {
    const result = insertLoraIntoValue('some tags, disables=[foo, bar]', 'test_lora')
    expect(result).toBe('some tags, <lora:test_lora>, disables=[foo, bar]')
  })

  it('should insert LoRA when value has only disables directive', () => {
    const result = insertLoraIntoValue('disables=[foo, bar]', 'test_lora')
    expect(result).toBe('<lora:test_lora>, disables=[foo, bar]')
  })

  it('should insert LoRA before disables with composition directive', () => {
    const result = insertLoraIntoValue(
      'some tags, composition=all, disables=[foo]',
      'test_lora'
    )
    expect(result).toBe('some tags, composition=all, <lora:test_lora>, disables=[foo]')
  })

  it('should handle value with prob directive and disables', () => {
    const result = insertLoraIntoValue('some tags, prob=50, disables=[foo]', 'test_lora')
    expect(result).toBe('some tags, prob=50, <lora:test_lora>, disables=[foo]')
  })

  it('should append LoRA to value with prob but no disables', () => {
    const result = insertLoraIntoValue('some tags, prob=50', 'test_lora')
    expect(result).toBe('some tags, prob=50, <lora:test_lora>')
  })

  it('should extract last component from path with forward slashes', () => {
    const result = insertLoraIntoValue('some tags', 'path/to/lora/test_lora.safetensors')
    expect(result).toBe('some tags, <lora:test_lora>')
  })

  it('should remove .safetensors extension', () => {
    const result = insertLoraIntoValue('some tags', 'test_lora.safetensors')
    expect(result).toBe('some tags, <lora:test_lora>')
  })

  it('should handle .safetensors extension case-insensitively', () => {
    const result1 = insertLoraIntoValue('some tags', 'test_lora.SAFETENSORS')
    expect(result1).toBe('some tags, <lora:test_lora>')

    const result2 = insertLoraIntoValue('some tags', 'test_lora.SafeTensors')
    expect(result2).toBe('some tags, <lora:test_lora>')
  })

  it('should handle path and extension together', () => {
    const result = insertLoraIntoValue(
      'some tags, disables=[foo]',
      'models/lora/subfolder/my_lora.safetensors'
    )
    expect(result).toBe('some tags, <lora:my_lora>, disables=[foo]')
  })

  it('should work with LoRA name without extension', () => {
    const result = insertLoraIntoValue('some tags', 'test_lora')
    expect(result).toBe('some tags, <lora:test_lora>')
  })
})
