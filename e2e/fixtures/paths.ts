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
