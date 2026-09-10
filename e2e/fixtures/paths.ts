// ============================================================
// e2e/fixtures/paths.ts — shared paths.
//
// This exists so playwright.config.ts and e2e/setup/auth.setup.ts can agree on
// the storage-state location without the config importing the setup file:
// Playwright loads the config first, and importing a module that calls
// setup()/test() at import time is an error ("did not expect test() to be
// called here").
// ============================================================

/** Where the setup project writes the shared authenticated browser state. */
export const STORAGE_STATE_PATH = 'e2e/.auth/user.json'

/**
 * The long-lived user the `setup` project signs in as (e2e/setup/auth.setup.ts),
 * deliberately left with no accounts/registers. Lives here, not in auth.setup.ts,
 * for the same reason STORAGE_STATE_PATH does: any file that needs the value
 * without triggering the setup project's own test registration imports it from
 * here instead of importing auth.setup.ts directly.
 */
export const STORAGE_STATE_EMAIL = 'dcr-e2e-storage@example.test'