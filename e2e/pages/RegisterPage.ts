import type { Page, Locator } from '@playwright/test'

// 0-based; order: check#, date, description, status, debit, credit, balance, notes, sched. date
const COL = { balance: 6 } as const

type NewTransaction = {
    checkNumber?: number
    tranactionDate?: Date
    description: string
    status: 'Recorded' | 'Cleared' | 'Pending' | 'Void'
    debit?: number
    credit?: number
    notes?: string
    scheduledDate?: Date
}

export class RegisterPage {
    readonly signOutButton: Locator
    readonly actualBalance: Locator
    readonly availableBalance: Locator
    readonly addTransactionButton: Locator
    readonly editBalanceButton: Locator
    readonly saveButton: Locator
    readonly cancelButton: Locator

    constructor(private readonly page: Page) {
        this.signOutButton = this.page.getByRole('button', { name: 'Sign out' })
        this.actualBalance = this.page.getByText('Actual Balance', { exact: true }).locator('xpath=preceding-sibling::span')
        this.availableBalance = this.page.getByText('Available Balance', { exact: true }).locator('xpath=preceding-sibling::span')
        this.addTransactionButton = this.page.getByRole('button', { name: '+ Add transaction' })
        this.editBalanceButton = this.page.getByRole('button', { name: 'Edit opening balance' })
        this.saveButton = this.page.getByRole('button', { name: 'Save' })
        this.cancelButton = this.page.getByRole('button', { name: 'Cancel' })
    }

    row(description: string): { balance: Locator } {
        const row = this.page.getByRole('row', { name: description })
        return {
            balance: row.getByRole('cell').nth(COL.balance),
        }
    }

    async addTransaction(tx: NewTransaction): Promise<void> {
        const addRow = this.page.getByRole('row').filter({
            has: this.page.getByRole('textbox', { name: 'Description *' }),
        })

        await this.addTransactionButton.click()
        await this.page.getByRole('textbox', { name: 'Description *' }).fill(tx.description)
        await addRow.getByRole('combobox').selectOption(tx.status)

        if (tx.debit !== undefined) {
            await this.page.getByRole('textbox', { name: 'Debit' }).fill(String(tx.debit))
        }

        if (tx.credit !== undefined) {
            await this.page.getByRole('textbox', { name: 'Credit' }).fill(String(tx.credit))
        }

        if (tx.notes !== undefined) {
            await this.page.getByRole('textbox', { name: 'Notes' }).fill(tx.notes)
        }

        await this.saveButton.click()
        await this.page.getByRole('row', { name: tx.description }).waitFor() // saved row has appeared
        await this.cancelButton.click() // Close the add transaction row
    }
}