// ============================================================
// extract-fixtures.mjs — sanitized Excel workbook → golden fixture JSON
//
// Usage:
//   node scripts/extract-fixtures.mjs \
//     --workbook path/to/sanitized.xlsx \
//     --sheets JULY,AUGUST \
//     --scenario chain_2026_q3 \
//     --out src/lib/__fixtures__/golden/chain_2026_q3.json \
//     [--available-cell G2]   # optional oracle-computed Available helper cell
//
// Reads the register table on each named tab (headers: Check #, DATE,
// DESCRIPTION OF TRANSACTION, C, DEBIT (-), CREDIT (+), BALANCE, Notes/Memos),
// treats the first "Previous Balance" row as opening_balance, maps column E
// (1=cleared, 2=pending, blank=recorded), and emits expected values read from
// Excel's own computed cells. See docs/golden-master/FIXTURE_SCHEMA.md.
// ============================================================

import ExcelJS from 'exceljs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, basename } from 'node:path'

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    args[key.slice(2)] = argv[i + 1]
    i++
  }
  const missing = ['workbook', 'sheets', 'scenario', 'out'].filter((k) => !args[k])
  if (missing.length) {
    console.error(`Missing required argument(s): ${missing.map((m) => '--' + m).join(', ')}`)
    process.exit(1)
  }
  return args
}

// ── Cell helpers ─────────────────────────────────────────────────────────────

/** Unwrap exceljs cell values: formula cells carry { formula, result }. */
function cellValue(cell) {
  const v = cell?.value
  if (v == null) return null
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? null
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if (v instanceof Date) return v
    if ('error' in v) return null
  }
  return v
}

function asNumber(cell) {
  const v = cellValue(cell)
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? round2(n) : null
}

function asText(cell) {
  const v = cellValue(cell)
  if (v == null) return null
  const s = (v instanceof Date ? v.toISOString() : String(v)).trim()
  return s === '' ? null : s
}

function asIsoDate(cell) {
  const v = cellValue(cell)
  if (v == null || v === '') return null
  if (v instanceof Date) {
    // exceljs returns UTC-anchored dates for date cells; read UTC components.
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).trim() || null
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── Table extraction ─────────────────────────────────────────────────────────

const HEADER_ANCHOR = /description of transaction/i
const PREV_BALANCE = /previous\s*balance/i

function findColumns(sheet) {
  for (let r = 1; r <= Math.min(sheet.rowCount, 30); r++) {
    const row = sheet.getRow(r)
    const cols = {}
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const t = asText(cell)
      if (!t) return
      if (/^check\s*#/i.test(t)) cols.check = colNumber
      else if (/^date$/i.test(t)) cols.date = colNumber
      else if (HEADER_ANCHOR.test(t)) cols.description = colNumber
      else if (/^c$/i.test(t)) cols.status = colNumber
      else if (/debit/i.test(t)) cols.debit = colNumber
      else if (/credit/i.test(t)) cols.credit = colNumber
      else if (/^balance$/i.test(t)) cols.balance = colNumber
      else if (/notes|memo/i.test(t)) cols.notes = colNumber
    })
    if (cols.description && cols.debit && cols.credit && cols.balance) {
      return { headerRow: r, cols }
    }
  }
  throw new Error(`Sheet "${sheet.name}": could not locate the register table header row.`)
}

function mapStatus(statusCell, hasAmounts, sheetName, rowNumber) {
  const v = cellValue(statusCell)
  if (v == null || v === '') return 'recorded'
  const n = Number(v)
  if (n === 1) return 'cleared'
  if (n === 2) return 'pending'
  throw new Error(
    `Sheet "${sheetName}" row ${rowNumber}: unexpected status value "${v}" ` +
      `(expected 1, 2, or blank). hasAmounts=${hasAmounts}`,
  )
}

function extractSheet(sheet) {
  const { headerRow, cols } = findColumns(sheet)
  let openingBalance = null
  const transactions = []
  const runningBalances = []
  let rowOrder = 0
  let blankStreak = 0

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const description = cols.description ? asText(row.getCell(cols.description)) : null
    const debit = asNumber(row.getCell(cols.debit))
    const credit = asNumber(row.getCell(cols.credit))
    const balance = asNumber(row.getCell(cols.balance))
    const notes = cols.notes ? asText(row.getCell(cols.notes)) : null

    const isEmpty = description == null && debit == null && credit == null && balance == null
    if (isEmpty) {
      // Two consecutive fully-empty rows terminate the table.
      if (++blankStreak >= 2) break
      continue
    }
    blankStreak = 0

    // First "Previous Balance" row → opening balance, excluded from transactions.
    if (openingBalance == null && description != null && PREV_BALANCE.test(description)) {
      openingBalance = balance ?? credit
      if (openingBalance == null) {
        throw new Error(`Sheet "${sheet.name}" row ${r}: Previous Balance row has no value.`)
      }
      continue
    }

    const hasAmounts = debit != null || credit != null
    const status = mapStatus(
      cols.status ? row.getCell(cols.status) : null,
      hasAmounts,
      sheet.name,
      r,
    )

    rowOrder++
    transactions.push({
      row_order: rowOrder,
      date: cols.date ? asIsoDate(row.getCell(cols.date)) : null,
      description: description ?? '',
      status,
      debit,
      credit,
      check_number: cols.check ? asNumber(row.getCell(cols.check)) : null,
      notes,
    })
    // Oracle expectation: Excel's computed balance for this row (blank → null).
    runningBalances.push(hasAmounts ? balance : null)
  }

  if (openingBalance == null) {
    throw new Error(
      `Sheet "${sheet.name}": no "Previous Balance" row found — cannot determine opening balance.`,
    )
  }
  if (transactions.length === 0) {
    console.warn(`Sheet "${sheet.name}": no transactions found (empty month fixture).`)
  }
  return { openingBalance: round2(openingBalance), transactions, runningBalances }
}

// ── Expected-value assembly ──────────────────────────────────────────────────

function lastNumeric(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]
  return null
}

function buildMonth(sheet, label, openingSource, availableCellRef) {
  const { openingBalance, transactions, runningBalances } = extractSheet(sheet)

  // Oracle semantics: current = actual = closing = last numeric balance in H.
  const closing = lastNumeric(runningBalances) ?? openingBalance

  let available
  let availableSource
  if (availableCellRef) {
    available = asNumber(sheet.getCell(availableCellRef))
    availableSource = 'excel'
    if (available == null) {
      throw new Error(`Sheet "${sheet.name}": --available-cell ${availableCellRef} is empty.`)
    }
  } else {
    // Script-derived (independent arithmetic, not the app's code): cleared-only sum.
    available = round2(
      transactions.reduce(
        (acc, t) => (t.status === 'cleared' ? acc + (t.credit ?? 0) - (t.debit ?? 0) : acc),
        openingBalance,
      ),
    )
    availableSource = 'script-derived'
  }

  const nonVoidWithAmounts = transactions.filter((t) => t.debit != null || t.credit != null)
  const isReconciled =
    transactions.length > 0 && transactions.every((t) => t.status === 'cleared')

  return {
    label,
    opening_balance: openingBalance,
    opening_source: openingSource,
    transactions,
    expected: {
      running_balances: runningBalances,
      current_balance: closing,
      available_balance: available,
      actual_balance: closing,
      closing_balance: nonVoidWithAmounts.length === 0 ? openingBalance : closing,
      is_reconciled: isReconciled,
      available_source: availableSource,
    },
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv)
  const sheetNames = args.sheets.split(',').map((s) => s.trim()).filter(Boolean)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(args.workbook)

  const months = []
  for (let i = 0; i < sheetNames.length; i++) {
    const sheet = wb.getWorksheet(sheetNames[i])
    if (!sheet) {
      console.error(
        `Sheet "${sheetNames[i]}" not found. Available: ${wb.worksheets.map((w) => w.name).join(', ')}`,
      )
      process.exit(1)
    }
    months.push(
      buildMonth(sheet, sheetNames[i], i === 0 ? 'manual' : 'carry', args['available-cell']),
    )
  }

  // Chain expectations: each subsequent month's opening (its Previous Balance
  // row, computed by Excel's LOOKUP) is the oracle's carry-forward value.
  const carryForwards = months.slice(1).map((m) => m.opening_balance)

  const fixture = {
    schema_version: 1,
    scenario: args.scenario,
    source: `excel:${basename(args.workbook)}:${sheetNames.join(',')}`,
    description: args.description ?? `Extracted from sanitized workbook tabs ${sheetNames.join(', ')}`,
    months,
    ...(carryForwards.length > 0 ? { expected_chain: { carry_forwards: carryForwards } } : {}),
  }

  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, JSON.stringify(fixture, null, 2) + '\n')

  const txCount = months.reduce((n, m) => n + m.transactions.length, 0)
  console.log(
    `Wrote ${args.out}: ${months.length} month(s), ${txCount} transaction(s), ` +
      `${carryForwards.length} chain link(s).`,
  )
  console.log('Reminder: verify the workbook copy was sanitized before committing this JSON.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
