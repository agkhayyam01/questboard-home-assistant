import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app version comes from the add-on config so the UI always matches the installed release.
const config = readFileSync(new URL('../config.yaml', import.meta.url), 'utf8')
const version = config.match(/^version:\s*"?([^"\s]+)"?/m)?.[1] ?? 'unknown'
const build = process.env.QUESTBOARD_BUILD_ID || new Date().toISOString().replace(/\.\d+Z$/, 'Z')

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_ID__: JSON.stringify(build),
  },
})
