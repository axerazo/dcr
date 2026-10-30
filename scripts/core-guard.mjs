// scripts/core-guard.mjs — the "Core guard" check (issue #28, CLAUDE.md Hard rule 1).
//
// Fails a PR that touches a core path (.github/core-paths.txt) until the
// core-change-approved label is applied, and names every core file it touched.
// Runs from the BASE branch under pull_request_target: it never checks out or
// runs PR code. The changed-file list comes from the GitHub API only.

import { readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export const APPROVAL_LABEL = 'core-change-approved'
const GROUPS = ['code', 'expectations', 'guard']

/** Parse core-paths.txt into { code: [], expectations: [], guard: [] }. */
export function parseCorePaths(text) {
  const groups = Object.fromEntries(GROUPS.map((g) => [g, []]))
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const header = line.match(/^\[(.+)\]$/)
    if (header) {
      if (!GROUPS.includes(header[1])) throw new Error(`Unknown group [${header[1]}] in core-paths.txt`)
      current = header[1]
      continue
    }
    if (!current) throw new Error(`Path outside a [group] in core-paths.txt: ${line}`)
    groups[current].push(line)
  }
  return groups
}

/** The core group and matching entry for a repo-relative path, or null. */
export function matchCorePath(file, groups) {
  for (const group of GROUPS) {
    for (const entry of groups[group]) {
      if (entry.endsWith('/') ? file.startsWith(entry) : file === entry) return { group, entry }
    }
  }
  return null
}

/**
 * Decide the check result.
 * @param files  PR files as the GitHub API returns them: { filename, status, previous_filename? }
 * @param groups parsed core-paths.txt
 * @param labels label names on the PR
 * @returns {{ ok: boolean, approved: boolean, combined: boolean, hits: object[], message: string }}
 */
export function evaluate(files, groups, labels) {
  const hits = []
  for (const f of files) {
    const m = matchCorePath(f.filename, groups)
    if (m) {
      // A new file under a directory entry of the golden master adds coverage
      // without changing any existing expectation.
      const addedFixture = m.group === 'expectations' && f.status === 'added' && m.entry.endsWith('/')
      hits.push({ path: f.filename, group: m.group, status: f.status, addedFixture })
    }
    // A rename away from a core path removes that core file.
    if (f.previous_filename && f.previous_filename !== f.filename) {
      const p = matchCorePath(f.previous_filename, groups)
      if (p) hits.push({ path: f.previous_filename, group: p.group, status: 'removed', addedFixture: false })
    }
  }

  const approved = labels.includes(APPROVAL_LABEL)
  const touchesCode = hits.some((h) => h.group === 'code')
  const touchesExpectations = hits.some((h) => h.group === 'expectations')
  const combined = touchesCode && touchesExpectations
  const needsApproval = hits.some((h) => !h.addedFixture)

  let message
  if (hits.length === 0) {
    message = 'No core paths touched.'
  } else if (!needsApproval) {
    message = 'Only new golden fixtures added (no core code changed). No approval needed.'
  } else if (combined) {
    message =
      'Core code and its golden-master expectations changed in the same PR, so the golden master ' +
      `proves nothing for this change. ${approved ? `Approved by the ${APPROVAL_LABEL} label.` : `Apply the ${APPROVAL_LABEL} label to approve.`}`
  } else {
    message = `Core paths touched. ${approved ? `Approved by the ${APPROVAL_LABEL} label.` : `Apply the ${APPROVAL_LABEL} label to approve.`}`
  }

  return { ok: !needsApproval || approved, approved, combined, hits, message }
}

// Workflow-command property values must escape %, CR, LF, ":" and ",".
function escapeProperty(s) {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C')
}
function escapeData(s) {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

export function summaryMarkdown(result) {
  const icon = result.ok ? '✅' : '❌'
  const lines = [`## ${icon} Core guard`, '', result.message, '']
  if (result.hits.length > 0) {
    lines.push('| Core file | Group | Change |', '| --- | --- | --- |')
    for (const h of result.hits) {
      lines.push(`| \`${h.path}\` | ${h.group} | ${h.status}${h.addedFixture ? ' (new fixture)' : ''} |`)
    }
    lines.push('', 'Core path list: `.github/core-paths.txt` (CLAUDE.md Hard rule 1).')
  }
  return lines.join('\n') + '\n'
}

async function listPrFiles({ token, repo, pr }) {
  const files = []
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    const batch = await res.json()
    files.push(...batch)
    if (batch.length < 100) return files
  }
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, PR_LABELS, CHANGED_FILES, GITHUB_STEP_SUMMARY } = process.env
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) {
    throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required')
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  const groups = parseCorePaths(readFileSync(path.join(here, '..', '.github', 'core-paths.txt'), 'utf8'))
  const labels = JSON.parse(PR_LABELS || '[]')
  const files = await listPrFiles({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY, pr: PR_NUMBER })

  // The files API stops at 3,000 files. Fail closed rather than miss a core file.
  const expected = Number(CHANGED_FILES)
  if (Number.isFinite(expected) && files.length < expected) {
    console.log(`::error title=Core guard::Listed ${files.length} of ${expected} changed files; cannot verify core paths.`)
    process.exit(1)
  }

  const result = evaluate(files, groups, labels)
  const level = result.ok ? 'notice' : 'error'
  for (const h of result.hits) {
    console.log(`::${level} file=${escapeProperty(h.path)},title=Core guard::${escapeData(`${h.group} (${h.status}): ${result.message}`)}`)
  }
  console.log(result.message)
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, summaryMarkdown(result))
  if (!result.ok) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.log(`::error title=Core guard::${escapeData(String(err?.message ?? err))}`)
    process.exit(1)
  })
}
