<!-- Reusable action button component -->
<script lang="ts">
  import type { Component, Snippet } from 'svelte'

  interface Props {
    onclick: () => void
    title?: string
    variant?: 'green' | 'blue' | 'red' | 'gray'
    size?: 'sm' | 'md' | 'lg'
    icon?: Component
    children?: Snippet
    disabled?: boolean
    tabindex?: number
  }

  let {
    onclick,
    title = '',
    variant = 'gray',
    size = 'sm',
    icon,
    children,
    disabled = false,
    tabindex = -1
  }: Props = $props()

  const variantClasses = {
    green: 'bg-green-100 text-green-700 hover:bg-green-200 focus:ring-green-500',
    blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:ring-blue-500',
    red: 'bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500',
    gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500'
  }

  const sizeClasses = {
    sm: 'p-1.5 text-sm',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  }

  const baseClasses =
    'inline-flex items-center gap-1 rounded-md focus:outline-none focus:ring-2 transition-colors font-medium'
  const disabledClasses = 'opacity-50 cursor-not-allowed'

  const buttonClasses = $derived(
    [baseClasses, variantClasses[variant], sizeClasses[size], disabled ? disabledClasses : ''].join(
      ' '
    )
  )
</script>

<button type="button" class={buttonClasses} {onclick} {title} {disabled} {tabindex}>
  {#if icon}
    {@const IconComponent = icon}
    <IconComponent class="w-4 h-4" />
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>
