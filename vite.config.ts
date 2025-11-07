import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' }),
    sveltekit()
  ],
  server: {
    watch: {
      ignored: [
        path.resolve(rootDir, 'vendor/comfy-venv/**'),
        path.resolve(rootDir, 'vendor/ComfyUI/**')
      ]
    }
  },
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
