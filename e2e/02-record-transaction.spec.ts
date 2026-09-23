// @ts-check
import { test, expect } from './fixtures/seed'
import { Locator } from '@playwright/test'

test.describe('CUJ-02: existing user records a transaction and sees it in the register', () => {

    // Oracle: Each new row shows the correct running balance; header Actual Balance equals opening − debit + credit. Same
    // invariant the golden suite proves at unit level, now verified through the assembled UI — one invariant, two layers
    // of the pyramid.

    test("Verify opening balance are displayed on the page correctly along with their associated labels", async ({ page, seed }) => {
        const { openingBalance } = seed

        // Convert opening balance to a string in the format $ + value (comma separated) with two decimal places
        const openingBalanceString = `$${openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

        // Start with the user already signed in and on the register page.
        // The seed fixture has already signed in the user, so we can go directly to the register.
        await page.goto('/')

        // Verify both "Actual Balance" and "Available Balance" text exists on the page and the values are equal to the opening balance
        const actualBalanceElement = page.getByText(`${openingBalanceString}Actual Balance`)
        const availableBalanceElement = page.getByText(`${openingBalanceString}Available Balance`)

        await expect(actualBalanceElement).toBeVisible()
        await expect(actualBalanceElement).toContainText(openingBalanceString)
        await expect(actualBalanceElement).toContainText('Actual Balance')

        await expect(availableBalanceElement).toBeVisible()
        await expect(availableBalanceElement).toContainText(openingBalanceString)
        await expect(availableBalanceElement).toContainText('Available Balance')

        // Verify in the table, the first row contains the opening balance with the correct label "Opening Balance" and the correct value

        // Verify the first row of the transaction table contains the correct label "Opening Balance" and the correct value
        const transactionTable = page.getByRole('table')
        const openingBalanceRow = page.getByRole('row', { name: 'Opening Balance' })

        // Verify table row contains Opening Balance & contains the correct text 'Opening Balance'
        await expect(openingBalanceRow).toBeVisible()
        await expect(transactionTable).toBeVisible()

        // Verify the opening balance in table row is matches openBalanceString and is correctly displayed in the row
        const openingBalanceCell = openingBalanceRow.getByRole('cell', { name: openingBalanceString })
        await expect(openingBalanceCell).toBeVisible()
        await expect(openingBalanceCell).toContainText(openingBalanceString)
    })

    test("Verify that the user can record a debit transaction and see it in the register", async ({ page, seed }) => {
        const { openingBalance } = seed

        // Start with the user already signed in and on the register page.
        // The seed fixture has already signed in the user, so we can go directly to the register.
        await page.goto('/')

        // Record a new transaction
        const transactionDescription = 'Test Transaction'
        const bankStatus = "Cleared"
        const transactionAmount = 100.00
        const transactionNote = 'Test Note'

        // Fill in the transaction form:
        await page.getByRole('button', { name: 'Add Transaction' }).click()

        await page.getByRole('textbox', { name: 'Description' }).focus() // Focus on the Description field
        await page.getByRole('textbox', { name: 'Description' }).fill(transactionDescription)

        const row: Locator = page.locator('tr').filter({ hasText: `${bankStatus}` })
        const statusDropdown: Locator = row.getByRole('combobox')

        await statusDropdown.selectOption({ label: `${bankStatus}` })
        await expect(statusDropdown).toHaveValue(bankStatus.toLowerCase())

        await page.getByRole('textbox', { name: 'Debit' }).focus() // Focus on the Debit field
        await page.getByRole('textbox', { name: 'Debit' }).fill(transactionAmount.toString())

        await page.getByRole('textbox', { name: 'Note' }).focus() // Focus on the Note field
        await page.getByRole('textbox', { name: 'Note' }).fill(transactionNote)

        await page.getByRole('button', { name: 'Save' }).focus() // Focus on the Save button
        await page.getByRole('button', { name: 'Save' }).click()

        // Verify the new transaction appears in the register
        const transactionRow = page.getByRole('row', { name: transactionDescription })
        await expect(transactionRow).toBeVisible()

        // Verify the transaction amount is displayed correctly in the row
        const transactionAmountCell = transactionRow.getByRole('cell', { name: `$${transactionAmount.toFixed(2)}` })
        await expect(transactionAmountCell).toBeVisible()
        await expect(transactionAmountCell).toContainText(`$${transactionAmount.toFixed(2)}`)

        // Verify the running balance is updated correctly
        const expectedRunningBalance = openingBalance - transactionAmount
        const expectedRunningBalanceString = `$${expectedRunningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

        const runningBalanceCell = transactionRow.getByRole('cell', { name: expectedRunningBalanceString })
        await expect(runningBalanceCell).toBeVisible()
        await expect(runningBalanceCell).toContainText(expectedRunningBalanceString)

        // Verify the "Actual Balance" and "Available Balance" are updated correctly
        const actualBalanceElement = page.getByText(`${expectedRunningBalanceString}Actual Balance`)
        await expect(actualBalanceElement).toBeVisible()
        await expect(actualBalanceElement).toContainText(expectedRunningBalanceString)
        await expect(actualBalanceElement).toContainText('Actual Balance')

        // Assuming available balance is actual balance + any pending transactions (in this case, the transaction we just added)
        const availableBalanceValueElement = expectedRunningBalance
        const availableBalanceString = `$${availableBalanceValueElement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const availableBalanceElement = page.getByText(`${availableBalanceString}Available Balance`)

        await expect(availableBalanceElement).toBeVisible()
        await expect(availableBalanceElement).toContainText(availableBalanceString)
        await expect(availableBalanceElement).toContainText('Available Balance')
    })

    test("Verify that the user can record a credit transaction and see it in the register", async ({ page, seed }) => {
        const { openingBalance } = seed

        // Start with the user already signed in and on the register page.
        // The seed fixture has already signed in the user, so we can go directly to the register.
        await page.goto('/')

        // Record a new transaction
        const transactionDescription = 'Test Transaction'
        const bankStatus = "Pending"
        const transactionAmount = 50.00
        const transactionNote = 'Test Note'

        // Fill in the transaction form:
        await page.getByRole('button', { name: 'Add Transaction' }).click()

        await page.getByRole('textbox', { name: 'Description' }).focus() // Focus on the Description field
        await page.getByRole('textbox', { name: 'Description' }).fill(transactionDescription)

        const row: Locator = page.locator('tr').filter({ hasText: `${bankStatus}` })
        const statusDropdown: Locator = row.getByRole('combobox')

        await statusDropdown.selectOption({ label: `${bankStatus}` })
        await expect(statusDropdown).toHaveValue(bankStatus.toLowerCase())

        await page.getByRole('textbox', { name: 'Credit' }).focus() // Focus on the Credit field
        await page.getByRole('textbox', { name: 'Credit' }).fill(transactionAmount.toString())

        await page.getByRole('textbox', { name: 'Note' }).focus() // Focus on the Note field
        await page.getByRole('textbox', { name: 'Note' }).fill(transactionNote)

        await page.getByRole('button', { name: 'Save' }).focus() // Focus on the Save button
        await page.getByRole('button', { name: 'Save' }).click()

        // Verify the new transaction appears in the register
        const transactionRow = page.getByRole('row', { name: transactionDescription })
        await expect(transactionRow).toBeVisible()

        // Verify the transaction amount is displayed correctly in the row
        const transactionAmountCell = transactionRow.getByRole('cell', { name: `$${transactionAmount.toFixed(2)}` })
        await expect(transactionAmountCell).toBeVisible()
        await expect(transactionAmountCell).toContainText(`$${transactionAmount.toFixed(2)}`)

        // Verify the running balance is updated correctly
        const expectedRunningBalance = openingBalance + transactionAmount
        const expectedRunningBalanceString = `$${expectedRunningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

        const runningBalanceCell = transactionRow.getByRole('cell', { name: expectedRunningBalanceString })
        await expect(runningBalanceCell).toBeVisible()
        await expect(runningBalanceCell).toContainText(expectedRunningBalanceString)

        // Verify the "Actual Balance" and "Available Balance" are updated correctly
        const actualBalanceElement = page.getByText(`${expectedRunningBalanceString}Actual Balance`)
        await expect(actualBalanceElement).toBeVisible()
        await expect(actualBalanceElement).toContainText(expectedRunningBalanceString)
        await expect(actualBalanceElement).toContainText('Actual Balance')

        // Assuming available balance is actual balance + any pending transactions (in this case, the transaction we just added)
        const availableBalanceValueElement = openingBalance
        const availableBalanceString = `$${availableBalanceValueElement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const availableBalanceElement = page.getByText(`${availableBalanceString}Available Balance`)

        await expect(availableBalanceElement).toBeVisible()
        await expect(availableBalanceElement).toContainText(availableBalanceString)
        await expect(availableBalanceElement).toContainText('Available Balance')
    })
})