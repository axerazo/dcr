import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-06: Close & Archive — ready-to-close prompt, soft close, lock banner, prior-month hard-close cascade', () => {

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Goal: User closes a fully reconciled month; the register locks and the lifecycle cascades.
    //
    // Preconditions: Register with all transactions cleared (ready_to_close); next-month register exists.
    //
    // Path: Accept the close prompt → Close & Archive.
    //
    // Oracle: Month shows the closed/locked banner; editing affordances disabled; next month's opening balance equals the closing balance and is frozen
    // from this month's perspective; if a prior soft-closed month existed, it is promoted to hard_closed (Direction A).
    //
    // Traceability: SPEC §11–§12 close flow.
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    test('Reconciliation - Close & Archive Monthly Register', async ({ page, register, seed }) => {
        const startingBalance = seed.openingBalance
        const { month, year } = seed                        // 1-based month, from the pinned `now`
        const priorMonth = new Date(year, month - 2, 1)
        const thisMonth = new Date(year, month - 1, 1)      // local midnight
        const followingMonth = new Date(year, month, 1)     // rolls Dec → Jan of year+1
        const monthName = thisMonth.toLocaleString('en-US', { month: 'long' })
        const previousMonthName = priorMonth.toLocaleString('en-US', { month: 'long' })
        const nextMonthName = followingMonth.toLocaleString('en-US', { month: 'long' })

        await seed.createRegister({ month: priorMonth.getMonth() + 1, year: priorMonth.getFullYear(), openingBalance: startingBalance, monthStatus: 'soft_closed', isLocked: true })
        await seed.createRegister({ month: followingMonth.getMonth() + 1, year: followingMonth.getFullYear(), openingBalance: startingBalance })
        await page.reload()

        await register.goToMonth(priorMonth)

        await expect(register.openingBalance).toHaveText(money(startingBalance))
        await expect(register.actualBalance).toHaveText(money(startingBalance))
        await expect(register.availableBalance).toHaveText(money(startingBalance))

        await expect(register.registerClosedBanner).toBeVisible()

        await expect(register.archiveBanner).toBeVisible()
        await expect(register.archiveBanner).toHaveText(`📦 ${previousMonthName} is archived — read-only.`)

        await expect(register.reopenMonthButton).toBeVisible()
        await expect(register.reopenMonthButton).toHaveText(`Reopen ${previousMonthName}`)

        await register.goToMonth(thisMonth)

        await expect(register.openingBalance).toHaveText(money(startingBalance))
        await expect(register.actualBalance).toHaveText(money(startingBalance))
        await expect(register.availableBalance).toHaveText(money(startingBalance))

        const debit = [100, 75]
        const credit = 50

        await register.addTransaction({ transactionDate: new Date(year, month - 1, 21), description: 'Cleared Debit 1', status: 'Cleared', debit: debit[0] })
        await register.addTransaction({ transactionDate: new Date(year, month - 1, 22), description: 'Cleared Debit 2', status: 'Cleared', debit: debit[1] })
        await register.addTransaction({ transactionDate: new Date(year, month - 1, 24), description: 'Cleared Credit 1', status: 'Cleared', credit: credit })

        const currentActualBalance = startingBalance - debit[0] - debit[1] + credit
        const currentAvailableBalance = currentActualBalance

        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentAvailableBalance))

        await expect(register.fullyReconciledBanner).toBeVisible()

        await expect(register.transactionsCleared).toBeVisible()
        await expect(register.transactionsCleared).toHaveText(`✅ All ${monthName} transactions are cleared.`)

        await expect(register.finalBalance).toBeVisible()
        await expect(register.finalBalance).toHaveText(`${monthName}'s final balance is ${money(currentActualBalance)}.`)

        await expect(register.nextOpeningBalanceBanner).toBeVisible()
        await expect(register.nextOpeningBalanceBanner).toHaveText(`${nextMonthName}'s opening balance is already up to date.`)

        await expect(register.readyToCloseQuestion).toBeVisible()
        await expect(register.readyToCloseQuestion).toHaveText(`Ready to close ${monthName}?`)

        await expect(register.notYetButton).toBeVisible()
        await expect(register.notYetButton).toHaveText('Not Yet')

        await expect(register.closeArchiveButton).toBeVisible()
        await expect(register.closeArchiveButton).toHaveText(`Close & Archive ${monthName}`)

        await register.closeArchiveButton.click()

        await expect(register.registerClosedBanner).toBeVisible()

        await expect(register.archiveBanner).toBeVisible()
        await expect(register.archiveBanner).toHaveText(`📦 ${monthName} is archived — read-only.`)

        await expect(register.reopenMonthButton).toBeVisible()
        await expect(register.reopenMonthButton).toHaveText(`Reopen ${monthName}`)

        await expect(register.addTransactionButton).not.toBeVisible()

        const lockedRow = register.row('Cleared Debit 2').locator

        await lockedRow.getByText('Cleared Debit 2').click()
        await expect(lockedRow.getByRole('textbox')).toHaveCount(0)
        await expect(lockedRow.getByRole('button')).toHaveCount(0)

        await register.goToMonth(followingMonth)

        await expect(register.openingBalance).toHaveText(money(currentActualBalance))
        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentAvailableBalance))

        await register.goToMonth(priorMonth)

        await expect(register.registerClosedBanner).toBeVisible()
        await expect(register.archivedChangesBanner).toBeVisible()
        await expect(register.permanentlyClosedMessage).toBeVisible()
        await expect(register.archiveBanner).toHaveCount(0)        // soft-closed state is gone: promoted, not just relabelled
        await expect(register.reopenMonthButton).toHaveCount(0)
        await expect(register.archivedChangesBanner).toHaveText(`⚠️ ${monthName} is archived. Changes to ${previousMonthName}'s closing balance will not automatically update ${monthName}'s opening balance until it is reopened. Reopen ${monthName} to apply the updated balance.`)
        await expect(register.unlockEdit).toBeVisible()
        await expect(register.unlockEdit).toHaveText('Unlock to Edit')
    })
})
