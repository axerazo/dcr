// Unit tests for the Core guard decision (scripts/core-guard.mjs, issue #28).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { APPROVAL_LABEL, parseCorePaths, matchCorePath, evaluate, summaryMarkdown } from './core-guard.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const groups = parseCorePaths(readFileSync(path.join(here, '..', '.github', 'core-paths.txt'), 'utf8'))

const FIXTURE = 'src/lib/__fixtures__/golden/seed_happy_path.json'
const NEW_FIXTURE = 'src/lib/__fixtures__/golden/seed_new_case.json'
const file = (filename, status = 'modified', extra = {}) => ({ filename, status, ...extra })

// ── core-paths.txt ──────────────────────────────────────────────────────────

describe('core-paths.txt', () => {
  it('lists the engine, the roll-over, the golden master and the guard', () => {
    expect(groups.code).toEqual([
      'src/lib/balance.ts',
      'src/lib/monthStatus.ts',
      'src/lib/rollover.ts',
      'src/components/register/RegisterView.tsx',
      'src/hooks/useRegister.ts',
    ])
    expect(groups.expectations).toEqual(['src/lib/__fixtures__/golden/', 'src/lib/golden.test.ts'])
    expect(groups.guard).toEqual(['.github/core-paths.txt', '.github/workflows/core-guard.yml', 'scripts/core-guard.mjs'])
  })

  it('rejects an unknown group or a path outside a group', () => {
    expect(() => parseCorePaths('[nope]\na.ts')).toThrow(/Unknown group/)
    expect(() => parseCorePaths('a.ts')).toThrow(/outside a \[group\]/)
  })
})

// ── matchCorePath ───────────────────────────────────────────────────────────

describe('matchCorePath', () => {
  it('matches exact files only', () => {
    expect(matchCorePath('src/lib/rollover.ts', groups)?.group).toBe('code')
    expect(matchCorePath('src/lib/rollover.test.ts', groups)).toBeNull()
    expect(matchCorePath('src/lib/balance.tsx', groups)).toBeNull()
  })

  it('matches everything below a directory entry', () => {
    expect(matchCorePath(FIXTURE, groups)?.group).toBe('expectations')
    expect(matchCorePath('src/lib/__fixtures__/other/x.json', groups)).toBeNull()
  })

  it('ignores non-core files', () => {
    expect(matchCorePath('docs/BACKLOG.md', groups)).toBeNull()
    expect(matchCorePath('src/components/register/TransactionTable.tsx', groups)).toBeNull()
  })
})

// ── evaluate ────────────────────────────────────────────────────────────────

describe('evaluate', () => {
  it('no core paths → passes, no hits', () => {
    const r = evaluate([file('docs/BACKLOG.md'), file('e2e/04-auto-carry.spec.ts')], groups, [])
    expect(r).toMatchObject({ ok: true, hits: [], message: 'No core paths touched.' })
  })

  it('core code without the label → fails and names the file', () => {
    const r = evaluate([file('src/lib/rollover.ts'), file('docs/BACKLOG.md')], groups, [])
    expect(r.ok).toBe(false)
    expect(r.hits.map((h) => h.path)).toEqual(['src/lib/rollover.ts'])
    expect(r.message).toContain(APPROVAL_LABEL)
  })

  it('core code with the label → passes, still names the file', () => {
    const r = evaluate([file('src/lib/rollover.ts')], groups, ['lane:dev', APPROVAL_LABEL])
    expect(r).toMatchObject({ ok: true, approved: true })
    expect(r.hits.map((h) => h.path)).toEqual(['src/lib/rollover.ts'])
  })

  it('a guard file without the label → fails', () => {
    expect(evaluate([file('.github/workflows/core-guard.yml')], groups, []).ok).toBe(false)
  })

  it('golden.test.ts changed alone → fails (not a new fixture)', () => {
    expect(evaluate([file('src/lib/golden.test.ts')], groups, []).ok).toBe(false)
  })

  it('renaming a core file away still counts', () => {
    const r = evaluate([file('src/lib/rollover2.ts', 'renamed', { previous_filename: 'src/lib/rollover.ts' })], groups, [])
    expect(r.ok).toBe(false)
    expect(r.hits).toEqual([expect.objectContaining({ path: 'src/lib/rollover.ts', status: 'removed' })])
  })

  // The three golden-fixture cases (#28 plan, change 4).
  describe('golden fixtures', () => {
    it('only a newly added fixture, no code change → passes without the label', () => {
      const r = evaluate([file(NEW_FIXTURE, 'added')], groups, [])
      expect(r).toMatchObject({ ok: true, approved: false, combined: false })
      expect(r.hits).toEqual([expect.objectContaining({ path: NEW_FIXTURE, addedFixture: true })])
    })

    it.each(['modified', 'removed', 'renamed'])('an existing fixture %s → fails until labelled', (status) => {
      const files = [file(FIXTURE, status)]
      expect(evaluate(files, groups, []).ok).toBe(false)
      expect(evaluate(files, groups, [APPROVAL_LABEL]).ok).toBe(true)
    })

    it('renaming a fixture to a new name → fails (the old fixture is gone)', () => {
      const files = [file(NEW_FIXTURE, 'renamed', { previous_filename: FIXTURE })]
      expect(evaluate(files, groups, []).ok).toBe(false)
    })

    it('a new fixture together with a code change → combined failure', () => {
      const r = evaluate([file('src/lib/balance.ts'), file(NEW_FIXTURE, 'added')], groups, [])
      expect(r).toMatchObject({ ok: false, combined: true })
      expect(r.message).toMatch(/golden master proves nothing/)
      expect(r.hits.map((h) => h.path)).toEqual(['src/lib/balance.ts', NEW_FIXTURE])
    })

    it('a modified fixture together with a code change → combined failure, cleared by the label', () => {
      const files = [file('src/components/register/RegisterView.tsx'), file(FIXTURE)]
      expect(evaluate(files, groups, [])).toMatchObject({ ok: false, combined: true })
      expect(evaluate(files, groups, [APPROVAL_LABEL])).toMatchObject({ ok: true, combined: true })
    })

    it('a new fixture together with a guard change → fails, but not combined', () => {
      const r = evaluate([file('scripts/core-guard.mjs'), file(NEW_FIXTURE, 'added')], groups, [])
      expect(r).toMatchObject({ ok: false, combined: false })
    })
  })
})

// ── summaryMarkdown ─────────────────────────────────────────────────────────

describe('summaryMarkdown', () => {
  it('names every core file touched', () => {
    const md = summaryMarkdown(evaluate([file('src/lib/rollover.ts'), file(NEW_FIXTURE, 'added')], groups, []))
    expect(md).toContain('❌ Core guard')
    expect(md).toContain('| `src/lib/rollover.ts` | code | modified |')
    expect(md).toContain(`| \`${NEW_FIXTURE}\` | expectations | added (new fixture) |`)
  })

  it('has no table when nothing core was touched', () => {
    expect(summaryMarkdown(evaluate([file('README.md')], groups, []))).not.toContain('|')
  })
})
