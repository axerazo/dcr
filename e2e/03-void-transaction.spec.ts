import { test, expect } from './fixtures/register'
import { money } from './support/money'

test.describe('CUJ-03: Void a transaction — strikethrough renders, voided amount drops out of balances', () => {

    // Goal: User voids an erroneous entry; the record stays visible & no longer counts toward any balance.
    // Preconditions: Register with three transactions and known balances.
    // Path: Void the middle transaction → confirm in the prompt.
    // Oracle: Row renders struck-through with dimmed styling; its balance cell empties; all other rows' balances and the header balances are
    // unchanged — the void-injection metamorphic property, verified through the UI. Audit expectation noted for a later API-level check.

    test('Void Transaction', async ({ register, seed }) => {

        const startingBalance = seed.openingBalance

        // Enter 3 transactions: 1 cleared debit, 1 recorded debit, 1 pending debit
        await register.addTransaction({ description: 'Cleared Debit', status: 'Cleared', debit: 100 })
        await register.addTransaction({ description: 'Recorded Debit', status: 'Recorded', debit: 50 })
        await register.addTransaction({ description: 'Pending Debit', status: 'Pending', debit: 25 })

        // Verify the balances after adding the transactions & before voiding any transaction
        await expect(register.row('Cleared Debit').balance).toHaveText(money(startingBalance - 100))
        await expect(register.row('Recorded Debit').balance).toHaveText(money(startingBalance - 100 - 50))
        await expect(register.row('Pending Debit').balance).toHaveText(money(startingBalance - 100 - 50 - 25))

        const currentActualBalance = startingBalance - 100 - 50 - 25
        // Both recorded and pending debits DON'T reduce available balance
        // Only cleared debits reduce actual balance
        const currentAvailableBalance = startingBalance - 100

        await expect(register.actualBalance).toHaveText(money(currentActualBalance))
        await expect(register.availableBalance).toHaveText(money(currentAvailableBalance))

        // Void the middle 'Recorded Debit' transaction
        await register.voidTransaction('Recorded Debit')

        const currentRunningBalanceAfterVoid = startingBalance - 100 - 25

        // Verify the voided transaction row renders struck-through and dimmed
        const voidedRow = register.row('Recorded Debit')
        await expect(voidedRow.locator).toHaveCSS('text-decoration-line', 'line-through')
        await expect(voidedRow.locator).toHaveCSS('opacity', '0.5') // Assuming the dimmed styling applies an opacity class
        await expect(voidedRow.locator).toHaveCSS('background-color', 'oklch(0.984 0.003 247.858)') // Assuming the dimmed styling applies a background color class

        // Verify the balance cell of the voided transaction row is empty (em-dash)
         await expect(voidedRow.balance).toHaveText('—')

        // Verify balances are correct after voiding the transaction
        await expect(register.row('Cleared Debit').balance).toHaveText(money(startingBalance - 100))
        await expect(register.row('Recorded Debit').balance).toHaveText('—') // Balance cell should be empty for voided transaction
        await expect(register.row('Pending Debit').balance).toHaveText(money(currentRunningBalanceAfterVoid))

        await expect(register.actualBalance).toHaveText(money(currentRunningBalanceAfterVoid))
        await expect(register.availableBalance).toHaveText(money(currentAvailableBalance))
    })
})