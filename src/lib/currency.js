// Supported currencies with display info
export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  { code: 'KRW', symbol: '₩', name: 'Korean Won', locale: 'ko-KR' },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
]

export const CURRENCY_OPTIONS = CURRENCIES.map(c => ({
  value: c.code,
  label: `${c.code} (${c.symbol}) - ${c.name}`,
}))

/**
 * Format a value in the given currency.
 * JPY and KRW don't use decimal places.
 */
export function formatCurrency(amount, currencyCode = 'USD') {
  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0]
  const value = Number(amount) || 0
  const decimals = (currencyCode === 'JPY' || currencyCode === 'KRW') ? 0 : 2

  return value.toLocaleString(currency.locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
