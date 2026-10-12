// Converts a string to a number, handling commas and currency symbols
export function parseMoney(value: string): number {
  // Remove any currency symbols and commas
  const cleanedValue = value.replace(/[$,]/g, '')
  return parseFloat(cleanedValue)
}

// Converts a number to a string formatted as currency
export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// Create a function called money that takes a number and returns a string formatted as currency
export function money(value: number): string {
  return formatMoney(value)
}