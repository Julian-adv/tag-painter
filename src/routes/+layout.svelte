<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { baseLocale, cookieName, getLocale, locales, setLocale } from '$lib/paraglide/runtime.js'

  let { children } = $props()

  type SupportedLocale = (typeof locales)[number]

  function isSupportedLocale(value: string): value is SupportedLocale {
    return locales.includes(value as SupportedLocale)
  }

  function readLocaleCookie(): SupportedLocale | undefined {
    if (typeof document === 'undefined') return undefined
    const match = document.cookie.match(new RegExp(`(?:^| )${cookieName}=([^;]+)`))
    const value = match?.[1]
    if (!value) return undefined
    return isSupportedLocale(value) ? value : undefined
  }

  function pickBrowserLocale(): SupportedLocale | undefined {
    if (typeof navigator === 'undefined') return undefined
    const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean)

    for (const raw of candidates) {
      const candidate = String(raw).toLowerCase()
      if (isSupportedLocale(candidate)) {
        return candidate
      }

      const base = candidate.split('-')[0]
      if (isSupportedLocale(base)) {
        return base
      }
    }

    return undefined
  }

  onMount(() => {
    const cookieLocale = readLocaleCookie()
    if (cookieLocale && cookieLocale !== baseLocale) return

    const browserLocale = pickBrowserLocale()
    if (!browserLocale) return

    const currentLocale = getLocale()
    if (browserLocale === currentLocale) return

    setLocale(browserLocale, { reload: false })
  })
</script>

{@render children()}
