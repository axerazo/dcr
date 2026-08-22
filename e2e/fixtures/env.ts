// ============================================================
// e2e/fixtures/env.ts — the single source of truth for E2E environment values.
//
// Nothing else in e2e/ reads process.env directly. Import `env` from here.
//
// This module carries the hard data-safety guard described in
// docs/e2e/TEST_PLAN.md §2: the E2E suite must NEVER touch the developer's
// live cloud Supabase project, which holds real financial data. The assertion
// below runs at import time — i.e. before Playwright launches a browser or
// seeds a single row — so a misconfigured run dies immediately and loudly.
// ============================================================

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root, resolved from this file's location (e2e/fixtures → ../..). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_TEST_PATH = resolve(REPO_ROOT, '.env.test')

// Node 22's built-in dotenv parser — no third-party dependency required.
// Note: loadEnvFile does NOT override variables already present in
// process.env, which is deliberate. It lets CI (or a shell export) win over
// the committed file without any extra plumbing here.
if (existsSync(ENV_TEST_PATH)) {
  process.loadEnvFile(ENV_TEST_PATH)
}

/** The four keys .env.test is contracted to provide. */
type RequiredKey =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'SUPABASE_DB_URL'

function requireEnv(key: RequiredKey): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `[e2e/env] Missing required environment variable ${key}.\n` +
        `  Expected it in ${ENV_TEST_PATH} (or the process environment).\n` +
        `  Regenerate the file with:  npm run env:test   (requires a running local Supabase stack)`,
    )
  }
  return value
}

const resolved = {
  supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('VITE_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseDbUrl: requireEnv('SUPABASE_DB_URL'),
} as const

// ------------------------------------------------------------
// DATA-SAFETY ASSERTION — do not soften, do not add an escape hatch.
//
// .env.local points at a live cloud project with real financial data. An E2E
// run that writes there is a catastrophic failure, not a bug. The only
// acceptable target is a loopback address.
// ------------------------------------------------------------
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost']

function assertLocalOnly(label: string, url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`[e2e/env] ${label} is not a valid URL: ${url}`)
  }

  if (!LOOPBACK_HOSTS.includes(host)) {
    throw new Error(
      `[e2e/env] REFUSING TO RUN — ${label} points at a non-local host.\n` +
        `  Offending value: ${url}\n` +
        `  Resolved host:   ${host}\n` +
        `  The E2E suite may only target a local Supabase stack (${LOOPBACK_HOSTS.join(' or ')}).\n` +
        `  This guard exists because .env.local points at a live cloud project holding real\n` +
        `  financial data. Fix the environment; do not bypass this check.`,
    )
  }
}

assertLocalOnly('VITE_SUPABASE_URL', resolved.supabaseUrl)
// SUPABASE_DB_URL is a postgresql:// URL — new URL() parses its hostname fine.
assertLocalOnly('SUPABASE_DB_URL', resolved.supabaseDbUrl)

/** Frozen, typed environment values for the E2E suite. */
export const env = Object.freeze(resolved)

export type E2eEnv = typeof env
