import { describe, it, expect } from 'vitest'
import { findLandingTransactionId, todayIso } from './landingRow'

const TODAY = '2026-11-15'

// In display order: date ascending, then created_at ascending
type Row = { id: string; date: string; status?: string; scheduled_date?: string | null }

describe('findLandingTransactionId (#61)', () => {
  it('picks the entry dated today', () => {
    const rows: Row[] = [
      { id: 'a', date: '2026-11-01' },
      { id: 'b', date: '2026-11-15' },
      { id: 'c', date: '2026-11-20' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBe('b')
  })

  it('picks the latest entry before today when none is dated today', () => {
    const rows: Row[] = [
      { id: 'a', date: '2026-11-01' },
      { id: 'b', date: '2026-11-10' },
      { id: 'c', date: '2026-11-28' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBe('b')
  })

  it('on a same-day tie picks the last-created entry (last in display order)', () => {
    const rows: Row[] = [
      { id: 'first', date: '2026-11-12' },
      { id: 'second', date: '2026-11-12' },
      { id: 'future', date: '2026-11-30' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBe('second')
  })

  it('ignores status: a void entry can be the landing entry', () => {
    const rows: Row[] = [
      { id: 'a', date: '2026-11-01', status: 'cleared' },
      { id: 'v', date: '2026-11-14', status: 'void' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBe('v')
  })

  it('returns the last entry when every entry is in the past (a past month)', () => {
    const rows: Row[] = [
      { id: 'a', date: '2026-10-02' },
      { id: 'b', date: '2026-10-31' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBe('b')
  })

  it('returns null when only future-dated entries exist', () => {
    const rows: Row[] = [
      { id: 'a', date: '2026-11-16' },
      { id: 'b', date: '2026-11-30' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBeNull()
  })

  it('returns null for an empty month', () => {
    expect(findLandingTransactionId([], TODAY)).toBeNull()
  })

  it('uses Date, not Sched. Date', () => {
    const rows: Row[] = [
      { id: 'past', date: '2026-11-05' },
      { id: 'futureDateSchedPast', date: '2026-11-25', scheduled_date: '2026-11-03' },
    ]
    expect(findLandingTransactionId(rows, TODAY)).toBe('past')
  })
})

describe('todayIso', () => {
  it('formats the local date with zero padding', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('stays on the local day just after local midnight (no UTC shift)', () => {
    expect(todayIso(new Date(2026, 10, 15, 0, 1))).toBe('2026-11-15')
  })
})
