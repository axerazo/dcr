// ============================================================
// e2e/setup/auth.setup.ts — the `setup` project (TEST_PLAN §2).
//
// Signs in through the real UI once per run and persists the resulting
// browser state to e2e/.auth/user.json, which every journey project loads as
// its starting storageState. Login itself is CUJ-01 and is tested explicitly
// in its own spec; this file exists so the other eleven journeys do not each
// pay for a login.
//
// ------------------------------------------------------------
// The ordering problem, and the decision
// ------------------------------------------------------------
// storageState is produced ONCE, by this setup project, before any test runs.
// Seed fixtures are per-test and therefore do not exist yet at that moment.
// So the storage-state user cannot be a per-test user — there is no per-test
// user to be. The choice is forced, not preferred:
//
//   DECISION: the storage-state user is a separate, long-lived seeded user
//   (STORAGE_STATE_EMAIL below), distinct from every per-test user.
//
// That alone would be a trap, because a test authenticated as the long-lived
// user cannot see data seeded for its own user — RLS scopes every table to
// auth.uid(). So the two halves are joined explicitly:
//
//   * This setup gives every context a valid, authenticated baseline, and
//     proves the real sign-in path works before any journey runs.
//   * The `seed` fixture (e2e/fixtures/seed.ts) then OVERRIDES that session
//     with its own user's session via context.addInitScript, which runs after
//     Playwright restores storageState and before any page script. A test that
//     declares `seed` is therefore authenticated as its own isolated user.
//
// The long-lived user is deliberately left with NO accounts and NO registers.
// Two reasons: it never accumulates data across runs, and a spec that forgets
// to declare `seed` fails loudly on the "No accounts yet" empty state instead
// of quietly passing against someone else's ledger.
// ============================================================

import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expect, test as setup } from '@playwright/test'
import { supabaseAdmin } from '../fixtures/supabase-admin'
import { SEED_PASSWORD } from '../fixtures/seed'
import { STORAGE_STATE_PATH } from '../fixtures/paths'

/** Stable address, so the user is created once and reused across local runs. */
const STORAGE_STATE_EMAIL = 'dcr-e2e-storage@example.test'

setup('authenticate', async ({ page }) => {
  // Idempotent create: the user survives between local runs, and CI starts
  // from an empty stack. An "already registered" error is the success path on
  // the second and later local runs.
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: STORAGE_STATE_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  })
  if (error && !/already|exists|registered/i.test(error.message)) {
    throw new Error(
      `[e2e/setup] Could not create the storage-state user ${STORAGE_STATE_EMAIL}: ${error.message}`,
    )
  }

  await page.goto('/')

  // Selector exception, documented per TEST_PLAN §2: src/pages/LoginPage.tsx
  // renders <label> elements that are neither wrapping nor linked by htmlFor,
  // so the inputs have no accessible name and getByLabel cannot reach them.
  // Falling back to type selectors rather than adding test ids to product code.
  // Fixing the label association in LoginPage would let CUJ-01 use getByLabel.
  await page.locator('input[type="email"]').fill(STORAGE_STATE_EMAIL)
  await page.locator('input[type="password"]').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  // The authenticated shell always renders Sign out, with or without accounts.
  // No TOTP step: supabase/config.toml sets [auth.mfa.totp] verify_enabled =
  // false, so the MFA branch in LoginPage is unreachable locally.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE_PATH })
})
