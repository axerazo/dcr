// ============================================================
// landingRow — where the register opens (#61)
// The register opens scrolled to the most recent entry whose Date (not
// Sched. Date) is on or before today, whatever its status.
// ============================================================

/** Today's local date as YYYY-MM-DD. Local, never UTC-shifted (CLAUDE.md Hard rule 6). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Returns the id of the most recent entry dated on or before `today`, or null when
 * there is none (empty month, or only future-dated entries).
 *
 * Expects the register's display order: date ascending, then created_at ascending
 * (see useTransactions). So the landing entry is the last one with date <= today,
 * and on a same-day tie the last-created entry wins.
 */
export function findLandingTransactionId(
  transactions: ReadonlyArray<{ id: string; date: string }>,
  today: string,
): string | null {
  for (let i = transactions.length - 1; i >= 0; i--) {
    // YYYY-MM-DD strings compare chronologically as text
    if (transactions[i].date <= today) return transactions[i].id
  }
  return null
}
