/**
 * Text formatting utilities for consistent formatting across components
 */

/**
 * Formats comma-separated values by ensuring proper spacing after commas
 * @param text - The text to format
 * @returns Formatted text with proper spacing after commas
 */
export function formatCommaSeparatedValues(text: string): string {
  if (!text) {
    return text
  }

  // Replace any sequence of comma followed by zero or more spaces with comma + single space
  // This handles: "a,b,c" -> "a, b, c" and "a,  b, c" -> "a, b, c"
  return text.replace(/,\s*/g, ', ').trim()
}

/**
 * Checks if a string contains comma-separated values (has at least one comma)
 * @param text - The text to check
 * @returns True if the text contains commas
 */
export function isCommaSeparated(text: string): boolean {
  return text.includes(',')
}
