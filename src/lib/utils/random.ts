// Random utility helpers shared across tag expansion features

/**
 * Generate a cryptographically secure random index within [0, max)
 */
export function getSecureRandomIndex(max: number): number {
  if (max <= 0) return 0
  const array = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(array)
    return array[0] % max
  }
  return Math.floor(Math.random() * max)
}

/**
 * Perform weighted random selection across provided options
 */
export function getWeightedRandomIndex<T extends { weight: number }>(options: T[]): number {
  if (options.length === 0) return 0
  if (options.length === 1) return 0

  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0)
  if (totalWeight <= 0) {
    return getSecureRandomIndex(options.length)
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    const random = (array[0] / 0xffffffff) * totalWeight
    let accumulator = 0
    for (let i = 0; i < options.length; i++) {
      accumulator += options[i].weight
      if (random <= accumulator) {
        return i
      }
    }
  } else {
    const random = Math.random() * totalWeight
    let accumulator = 0
    for (let i = 0; i < options.length; i++) {
      accumulator += options[i].weight
      if (random <= accumulator) {
        return i
      }
    }
  }

  return options.length - 1
}
