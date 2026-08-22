// ============================================================
// e2e/00-smoke.spec.ts — TEMPORARY. Delete once CUJ-01 lands.
//
// Proves the scaffold is wired end to end and nothing more:
//   1. the seed fixture creates a user in the local database,
//   2. storageState from the setup project is applied to the context,
//   3. the app loads at baseURL against the local stack,
//   4. the page is in an authenticated state, as the per-test user.
//
// It asserts structure only — no register contents, no balances, no journey.
// CUJ-01 through CUJ-03 own everything beyond this.
// ============================================================

import { expect, test } from './fixtures/seed'
import { STORAGE_STATE_PATH } from './fixtures/paths'

test('scaffold: seeded user lands authenticated at the app shell', async ({ page, seed }) => {
  // storageState really was applied to this context — the setup project ran
  // and its file was loaded, rather than the project silently starting blank.
  expect(test.info().project.use.storageState).toBe(STORAGE_STATE_PATH)

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
