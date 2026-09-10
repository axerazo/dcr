// ============================================================
// e2e/00-smoke.spec.ts — permanent. Not superseded by any CUJ.
//
// Proves the scaffold is wired end to end and nothing more:
//   1. the seed fixture creates a user in the local database,
//   2. storageState from the setup project is applied to the context,
//   3. the app loads at baseURL against the local stack,
//   4. the page is in an authenticated state, as the per-test user.
//
// It asserts structure only — no register contents, no balances, no journey.
//
// CUJ-01 intentionally never exercises assertion #2's mechanism — it resets
// storageState and signs in fresh via the UI, skipping the seed fixture's
// session-override path entirely. This file is the only coverage of that
// path, for all eleven other journeys that depend on it.
// ============================================================

import { expect, test } from './fixtures/seed'
import { STORAGE_STATE_EMAIL } from './fixtures/paths'

test('scaffold: default context restores the setup project\'s storageState', async ({ page }) => {
  // No `seed` fixture declared — this context never gets addInitScript's
  // session override, so whatever identity shows up here came purely from
  // Playwright restoring e2e/.auth/user.json, written by
  // e2e/setup/auth.setup.ts. This is claim #2: proves storageState was
  // actually restored onto the context, not just configured in
  // playwright.config.ts. The app-shell header renders unconditionally
  // (AppPage.tsx), even for this deliberately account-less user, so no
  // seeded data is needed to observe it.
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByText(STORAGE_STATE_EMAIL)).toBeVisible()
})

test('scaffold: seeded user lands authenticated at the app shell', async ({ page, seed }) => {
  await page.goto('/')

  // Authenticated shell chrome. Present with or without accounts, so this says
  // "signed in" without touching anything a journey spec will assert.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  // And signed in as THIS test's seeded user, not the long-lived storage-state
  // user — this is the assertion that proves the seed fixture's session
  // override beats the restored storageState. If per-test isolation ever
  // regresses, it fails here first.
  await expect(page.getByText(seed.email)).toBeVisible()
})