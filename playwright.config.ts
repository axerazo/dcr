// ============================================================
// playwright.config.ts — DCR end-to-end suite (docs/e2e/TEST_PLAN.md §2).
//
// Importing ./e2e/fixtures/env runs the data-safety assertion at config load,
// i.e. before Playwright starts the web server or launches a browser. If the
// resolved Supabase URL is not loopback, the run dies here.
// ============================================================

import { defineConfig, devices } from '@playwright/test'
import { env } from './e2e/fixtures/env'
import { STORAGE_STATE_PATH } from './e2e/fixtures/paths'

const isCI = Boolean(process.env.CI)
const BASE_URL = 'http://127.0.0.1:5173'

// Surfaced on every run so the target is never in doubt in a CI log.
console.log(`[e2e] Supabase target: ${env.supabaseUrl}`)

export default defineConfig({
  testDir: './e2e',

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Deliberately serial in CI to start with. Per-test isolation is designed in
  // (own user, own account, own register) but not yet proven under contention;
  // parallelism gets turned up on purpose later, not debugged on day one.
  workers: isCI ? 1 : undefined,

  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    // baseURL is a `use` option in Playwright, not a top-level one.
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE_PATH,
      },
    },
  ],

  webServer: {
    // --mode test makes Vite load .env.test, which overrides .env.local and so
    // points the app at the local stack instead of the live cloud project.
    command: 'npm run dev:test',
    url: BASE_URL,
    reuseExistingServer: !isCI,
    // Cold Vite starts (first dep pre-bundle) are slow; 120s keeps CI honest
    // without turning a slow boot into a flaky failure.
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
