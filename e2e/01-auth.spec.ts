import { test, expect } from './fixtures/seed'

test.describe('CUJ-01: Sign in and land on the current month\'s register', () => {

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Goal: An existing user authenticates and arrives at their account's register for the current calendar month.
    //
    // Preconditions: Seeded user + account + current-month register
    //
    // Path: Load app → enter credentials → submit.
    //
    // Oracle: Register header shows account nickname and current month/year label; transaction table renders. Global setup persists storageState
    // here for all later journeys.
    //
    // Traceability: SPEC §16 (auth), §11.
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    test.use({ storageState: { cookies: [], origins: [] } }) // start off signed out

    test('Sign in and land on the current month\'s register', async ({ page, seedUnauthenticated }) => {
        const { email, password, accountNickname, month, year } = seedUnauthenticated

        await page.goto('/')
        await page.getByLabel('Email').fill(email)
        await page.getByLabel('Password').fill(password)
        await page.getByRole('button', { name: 'Sign In', exact: true }).click()

        // Convert month number to month name for assertion
        const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' })
        await expect(page.getByText(`${accountNickname}`)).toBeVisible()
        await expect(page.getByRole('heading', { name: `Check Register — ${monthName} ${year}` })).toBeVisible()
        await expect(page.getByRole('table')).toBeVisible()

        // Convert month name to 3-letter abbreviation for assertion
        const monthAbbreviation = monthName.slice(0, 3)
        await expect(page.getByRole('button', { name: `${monthAbbreviation}` })).toBeVisible()
    })
})
