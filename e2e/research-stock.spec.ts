import { expect, test } from '@playwright/test'

const quoteResponse = {
  'Global Quote': {
    '01. symbol': 'IBM',
    '05. price': '206.5000',
    '07. latest trading day': '2026-07-23',
    '08. previous close': '205.7700',
    '10. change percent': '0.3548%',
  },
}

const overviewResponse = {
  Symbol: 'IBM',
  Name: 'International Business Machines',
  Exchange: 'NYSE',
  Sector: 'TECHNOLOGY',
  Industry: 'INFORMATION TECHNOLOGY SERVICES',
  MarketCapitalization: '193400209000',
  TrailingPE: '18.21',
  DividendYield: '0.0319',
  EPS: '11.3',
  ProfitMargin: '0.156',
  ReturnOnEquityTTM: '0.358',
  QuarterlyRevenueGrowthYOY: '0.095',
  QuarterlyEarningsGrowthYOY: '0.142',
  Beta: '0.675',
}

test('researches a stock and explains its thesis fit', async ({ page }) => {
  await page.route('https://www.alphavantage.co/query?**', async (route) => {
    const url = new URL(route.request().url())
    const response =
      url.searchParams.get('function') === 'GLOBAL_QUOTE'
        ? quoteResponse
        : overviewResponse

    await route.fulfill({ json: response })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(
    page.getByRole('heading', { name: 'International Business Machines' }),
  ).toBeVisible()
  await expect(page.locator('.price-line strong')).toHaveText('$206.50')
  await expect(page.locator('.fit-panel > strong')).toHaveText('93')
  await expect(page.getByText('Source: Alpha Vantage', { exact: false })).toBeVisible()
})
