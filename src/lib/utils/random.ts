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
 * Perform probability-based random selection across provided options
 *
 * Logic:
 * 1. weight=-1: No explicit probability (use default equal distribution)
 * 2. weight=0: Explicitly excluded from selection
 * 3. If probabilities sum to <= 100%, distribute remaining probability to unspecified nodes (weight=-1)
 * 4. If probabilities sum to > 100%, treat as weights and normalize (ignore weight=-1 nodes)
 *
 * @param options Array of options with weight/probability values (-1=no explicit, 0=excluded, 0-100=probability, >100=weight)
 * @returns Index of the selected option
 */
export function getWeightedRandomIndex<T extends { weight: number }>(options: T[]): number {
  if (options.length === 0) return 0
  if (options.length === 1) return 0

  // Separate options into those with explicit probability and those without
  const withProb: { index: number; prob: number }[] = []
  const withoutProb: number[] = []

  for (let i = 0; i < options.length; i++) {
    const weight = options[i].weight
    if (weight === -1) {
      // No explicit probability set
      withoutProb.push(i)
    } else if (weight > 0) {
      // Explicit probability set (excluding weight=0 which means excluded)
      withProb.push({ index: i, prob: weight })
    }
    // weight=0 is excluded, so we don't add it to either list
  }

  // Calculate total probability
  const totalProb = withProb.reduce((sum, opt) => sum + opt.prob, 0)

  // Build final probability distribution
  const finalProbs: { index: number; prob: number }[] = []

  if (totalProb <= 100) {
    // Case 1: Total <= 100%, distribute remaining to unspecified nodes
    const remaining = 100 - totalProb
    const countWithoutProb = withoutProb.length

    // Add explicit probabilities
    for (const opt of withProb) {
      finalProbs.push(opt)
    }

    // Distribute remaining probability equally among unspecified nodes
    if (countWithoutProb > 0 && remaining > 0) {
      const equalShare = remaining / countWithoutProb
      for (const idx of withoutProb) {
        finalProbs.push({ index: idx, prob: equalShare })
      }
    }
  } else {
    // Case 2: Total > 100%, treat as weights and normalize
    // Only use nodes with explicit probabilities, ignore those without
    for (const opt of withProb) {
      finalProbs.push(opt)
    }
  }

  // If no valid probabilities, fall back to uniform selection
  if (finalProbs.length === 0) {
    return getSecureRandomIndex(options.length)
  }

  // Perform weighted selection
  const totalFinalProb = finalProbs.reduce((sum, opt) => sum + opt.prob, 0)

  if (totalFinalProb <= 0) {
    return getSecureRandomIndex(options.length)
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    const random = (array[0] / 0xffffffff) * totalFinalProb
    let accumulator = 0
    for (let i = 0; i < finalProbs.length; i++) {
      accumulator += finalProbs[i].prob
      if (random <= accumulator) {
        return finalProbs[i].index
      }
    }
  } else {
    const random = Math.random() * totalFinalProb
    let accumulator = 0
    for (let i = 0; i < finalProbs.length; i++) {
      accumulator += finalProbs[i].prob
      if (random <= accumulator) {
        return finalProbs[i].index
      }
    }
  }

  return finalProbs[finalProbs.length - 1].index
}
