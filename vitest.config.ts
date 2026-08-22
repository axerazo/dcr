import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    // Vitest and Playwright both claim *.spec.ts by default. e2e/ belongs to
    // Playwright (playwright.config.ts, testDir './e2e'); keeping it out here
    // means `npm run test:run` stays a fast, browser-free unit run.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
