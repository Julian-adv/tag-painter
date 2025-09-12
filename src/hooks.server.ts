import type { Handle } from '@sveltejs/kit'

// Limit preloading to JS in production to reduce preload warnings
export const handle: Handle = async ({ event, resolve }) => {
  if (process.env.NODE_ENV === 'production') {
    return resolve(event, {
      preload: ({ type }) => type === 'js'
    })
  }
  return resolve(event)
}
