# E2E local dev cheat sheet

Windows + Git Bash. Local-only helpers for running and exploring the Playwright suite.
Git and PR steps live in `git-workflow-cheatsheet.md`.

---

## 1. Free port 5173 (stuck Vite dev server)

**Why:** Playwright starts the app with `npm run dev:test` (Vite on `127.0.0.1:5173`,
`--strictPort`) and reuses one that is already running. A server can linger after a
VS Code Playwright run. While it runs, it keeps native binaries (e.g. `lightningcss`)
loaded, and Windows refuses to delete a loaded file. Symptoms: `npm ci` fails with
`EPERM … unlink …lightningcss….node`, or a run complains that the port is in use.

```bash
netstat -ano | grep :5173        # last column = PID of whatever is listening
taskkill //PID <pid> //F         # stop it (the double slash is required in Git Bash)
```

- Nothing on 5173? Close VS Code (its extensions can hold the file too), or reboot.
- `npm ci` deletes `node_modules` first, so a failed run leaves it half-removed. Release
  the lock, then run `npm ci` again.
- `npm ci` is only needed after `package.json` / lockfile changes.

---

## 2. Manual sandbox session (explore the UI as a seeded user)

**Why:** Playwright UI mode replays recorded snapshots, not a live page. This opens a real
browser, already signed in as a throwaway seeded user (account, register, optional
transactions) with the Inspector open: click around, use **Pick locator**, copy real
locators. Ending the session deletes the throwaway user.

**Prerequisite:** local Supabase running (`supabase start`, `npm run env:test`).

**One-time setup** (the file stays on your machine, never commit it):

```bash
echo "e2e/sandbox.spec.ts" >> .git/info/exclude
```

Create `e2e/sandbox.spec.ts` from the template below.

**Run:**

```bash
SANDBOX=1 npx playwright test e2e/sandbox.spec.ts --headed --no-deps
```

- `SANDBOX=1` is Git Bash syntax. PowerShell: `$env:SANDBOX=1; npx playwright test …`.
  Without it the spec skips itself, so a normal full-suite run just lists it as skipped.
- `--no-deps` skips the setup project; it needs `e2e/.auth/user.json` from an earlier
  run. Storage-state error? Drop `--no-deps`.
- Do not add `--debug`: it also pauses the setup project and every single action.
- End the session with **Resume** in the Inspector. Step over/into ends the test.
- Native dialogs (e.g. Void's `confirm`) are auto-dismissed by Playwright unless a handler
  exists. The template accepts them.

**Template** (`e2e/sandbox.spec.ts`):

```ts
import { test } from './fixtures/seed'

test('sandbox', async ({ page, seed }) => {
  test.skip(!process.env.SANDBOX, 'manual sandbox only')
  test.setTimeout(0)

  // Without a listener Playwright auto-dismisses confirm() and Void silently cancels.
  page.on('dialog', async (d) => {
    console.log(`[dialog] ${d.type()}: ${d.message()}`)
    await d.accept()
  })

  const today = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
  await seed.insertTransactions([
    { date: today, description: 'Cleared Debit',  status: 'cleared',  debit: 100 },
    { date: today, description: 'Recorded Debit', status: 'recorded', debit: 50 },
    { date: today, description: 'Pending Debit',  status: 'pending',  debit: 25 },
  ])

  await page.goto('/')
  await page.pause()
})
```

Dates must fall in the current month. Edit the rows to whatever state you need.

---

## Quick reference

| Symptom | Fix |
|---|---|
| `npm ci` → `EPERM … unlink …lightningcss….node` | §1: find the PID on 5173, `taskkill`, retry |
| Port 5173 already in use | §1 |
| Want to poke the UI as a logged-in seeded user | §2 |
| A `confirm()` (e.g. Void) does nothing in a Playwright browser | Playwright auto-dismissed it; add `page.on('dialog', …)` |
