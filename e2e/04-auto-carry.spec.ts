import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-04: Month rollover — register auto-created, opening balance live-carries', () => {

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Goal: The Phase 1.5 flagship behavior: navigating to a month with no register silently creates it from the
    // prior month's closing balance, and the opening stays live.
    //
    // Preconditions: Current month register with transactions including a trailing pending row (the $840-not-$870shape from the golden fixtures).
    //
    // Path: Navigate to next month → observe auto-created register → navigate back → add a transaction to the prior month → return to next month.
    //
    // Oracle: No Initialize form appears; opening balance equals the prior month's closing balance (status-blind, last amount-bearing row); after
    // the prior-month edit, the opening has live-updated. The informational banner shows the auto-carry copy with the pending count.
    //
    // Traceability: SPEC §11 auto-carry, §9 Formula E.
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    test('Transaction Rollover (All Transactions Cleared)', async ({ page, register, seed }) => {
        const startingBalance = seed.openingBalance

        const { month, year } = seed                        // 1-based month, from the pinned `now`
        const thisMonth = new Date(year, month - 1, 1)      // local midnight
        const followingMonth = new Date(year, month, 1)     // rolls Dec → Jan of year+1

        const fullMonthName = thisMonth.toLocaleDateString('en-US', { month: 'long' })

        await expect(register.openingBalance).toHaveText(money(startingBalance))
        await expect(register.actualBalance).toHaveText(money(startingBalance))
        await expect(register.availableBalance).toHaveText(money(startingBalance))

        await register.addTransaction({ transactionDate: new Date(year, month - 1, 27), description: 'Cleared Debit', status: 'Cleared', debit: 100 })
        await register.addTransaction({ transactionDate: new Date(year, month - 1, 28), description: 'Recorded Debit', status: 'Cleared', debit: 50 })
        await register.addTransaction({ transactionDate: new Date(year,month - 1, 29), description: 'Pending Debit', status: 'Pending', debit: 25 })

        const currentActualBalance = startingBalance - 100 - 50 - 25
        const currentAvailableBalance = startingBalance - 100 - 50

        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentAvailableBalance))

        await register.goToMonth(followingMonth)

        // The auto-created register carries the prior month's last transaction balance total until all rows are cleared
        // pirot to CLOSING & ARCHVING the prior month balance (status-blind: the last amount-bearing row) as its opening balance
        // for the next month. The pending debit still counts toward that closing balance.
        // The Actual Balance, Available Balance and the opening row all share that value in the new month.

        await expect(register.openingBalance).toHaveText(money(currentActualBalance))
        await expect(register.initializeContainer).toBeHidden()
        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentActualBalance))

        await register.goToMonth(thisMonth)

        await expect(page.getByText(/opening balance auto-carries .* closing balance/)).toContainText('1 transaction still pending in ' + fullMonthName)

        await register.updateTransactionStatus('Pending Debit', 'Cleared')

        const updatedBalance = currentActualBalance
        await expect(register.row('Pending Debit').balance).toHaveText(money(currentActualBalance))
        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentActualBalance))

        await register.goToMonth(followingMonth)

        const updatedOpeningBalance = updatedBalance

        await expect(register.openingBalance).toHaveText(money(updatedBalance))
        await expect(register.actualBalance).toHaveText(money(updatedOpeningBalance))
        await expect(register.availableBalance).toHaveText(money(updatedOpeningBalance))

        await register.goToMonth(thisMonth)

        await register.addTransaction({ transactionDate: new Date(year,month - 1, 29), description: 'Final Cleared Transaction', status: 'Cleared', debit: 10 })

        await expect(register.row('Final Cleared Transaction').balance).toHaveText(money(currentActualBalance - 10))
        await expect(register.actualBalance).toHaveText(money(updatedOpeningBalance - 10))
        await expect(register.availableBalance).toHaveText(money(updatedOpeningBalance - 10))

        await register.goToMonth(followingMonth)

        await expect(register.openingBalance).toHaveText(money(updatedBalance - 10))
        await expect(register.actualBalance).toHaveText(money(updatedOpeningBalance - 10))
        await expect(register.availableBalance).toHaveText(money(updatedOpeningBalance - 10))
    })
})