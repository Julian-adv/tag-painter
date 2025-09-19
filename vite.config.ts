import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' }), sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    alias: {
      $lib: new URL('./src/lib', import.meta.url).pathname
    }
  },
  resolve: process.env.VITEST
    ? {
        conditions: ['browser']
      }
    : undefined
})
