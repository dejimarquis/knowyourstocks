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
  await page.getByRole('button', { name: 'Search', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'International Business Machines' }),
  ).toBeVisible()
  await expect(page.locator('.price-line strong')).toHaveText('$206.50')
  await expect(page.locator('.fit-panel > strong')).toHaveText('93')
  await expect(page.getByText('Source: Alpha Vantage', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Add to watchlist' }).click()
  await page.getByRole('button', { name: 'Watchlist 1' }).click()
  await expect(page.getByRole('heading', { name: 'What deserves your attention?' })).toBeVisible()
  await expect(page.getByText('International Business Machines')).toBeVisible()
})

test('uses SEC filings when Finnhub fundamentals are incomplete', async ({
  page,
}) => {
  await page.route('https://finnhub.io/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/quote')) {
      await route.fulfill({
        json: { c: 220, dp: 4.86, pc: 209.81, t: 1784840400 },
      })
      return
    }

    if (url.pathname.endsWith('/stock/profile2')) {
      await route.fulfill({
        json: {
          exchange: 'NASDAQ NMS - GLOBAL MARKET',
          finnhubIndustry: 'Semiconductors',
          marketCapitalization: 58200,
          name: 'Cerebras Systems Inc.',
          ticker: 'CBRS',
        },
      })
      return
    }

    await route.fulfill({
      json: { metric: { marketCapitalization: 58200 } },
    })
  })
  await page.route('**/api/sec-fundamentals/CBRS', async (route) => {
    await route.fulfill({
      json: {
        symbol: 'CBRS',
        cik: '0002021728',
        companyName: 'Cerebras Systems Inc.',
        filingDate: '2026-06-24',
        revenue: 193406000,
        revenueGrowth: 0.9435,
        netIncome: -14006000,
        profitMargin: -0.0724,
        epsAnnualized: -0.88,
        earningsGrowth: null,
        stockholdersEquity: -194682000,
        returnOnEquity: null,
        source: 'SEC EDGAR',
      },
    })
  })

  await page.goto('/')
  await page.getByText('Data access').click()
  await page.getByLabel('Free Finnhub key').fill('personal-key')
  await page.getByLabel('Company or ticker').fill('CBRS')
  await page.getByRole('button', { name: 'Search', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Cerebras Systems Inc.' }),
  ).toBeVisible()
  await expect(page.locator('.fit-panel > strong')).not.toHaveText('—')
  await expect(page.getByText('Not meaningful')).toBeVisible()
  await expect(
    page.locator('.metric-grid details').nth(2).getByText('-7.2%', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.locator('.metric-grid details').nth(3).getByText('94.4%', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Source: Finnhub + SEC EDGAR', { exact: false }),
  ).toBeVisible()
})

test('builds a deterministic watchlist brief and layers Phi output', async ({
  page,
}) => {
  page.on('pageerror', (error) => console.error('PAGE ERROR', error))
  await page.route('https://finnhub.io/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/quote')) {
      await route.fulfill({
        json: { c: 206.5, dp: 6.2, pc: 194.45, t: 1784840400 },
      })
      return
    }

    if (url.pathname.endsWith('/stock/profile2')) {
      await route.fulfill({
        json: {
          exchange: 'NYSE',
          finnhubIndustry: 'Technology',
          marketCapitalization: 193400.209,
          name: 'International Business Machines',
          ticker: 'IBM',
        },
      })
      return
    }

    if (url.pathname.endsWith('/stock/metric')) {
      await route.fulfill({
        json: {
          metric: {
            beta: 0.675,
            epsTTM: 11.3,
            marketCapitalization: 193400.209,
            netProfitMarginTTM: 15.6,
            peBasicExclExtraTTM: 18.21,
            revenueGrowthTTMYoy: 9.5,
            roeTTM: 35.8,
          },
        },
      })
      return
    }

    if (url.pathname.endsWith('/calendar/earnings')) {
      await route.fulfill({
        json: {
          earningsCalendar: [{ symbol: 'IBM', date: '2026-07-28' }],
        },
      })
      return
    }

    await route.fulfill({
      json: {
        sentiment: { bullishPercent: 0.7, bearishPercent: 0.3 },
        buzz: { articlesInLastWeek: 8 },
      },
    })
  })
  await page.route('**/api/watchlist-intelligence', async (route) => {
    const body = route.request().postDataJSON() as {
      deterministicSignals: Array<{ id: string }>
    }
    const evidenceIds = body.deterministicSignals
      .slice(0, 2)
      .map((signal) => signal.id)

    await route.fulfill({
      json: {
        prioritizedSignalIds: body.deterministicSignals.map(
          (signal) => signal.id,
        ),
        summary: 'Price movement and an upcoming report deserve attention.',
        experimentalPatterns:
          evidenceIds.length === 2
            ? [
                {
                  title: 'Movement before a catalyst',
                  explanation:
                    'The price move and upcoming report may be related.',
                  evidenceIds,
                  confidence: 'medium',
                  thesisRelationship:
                    'The report may clarify the current quality thesis.',
                },
              ]
            : [],
        uncertainties: [],
      },
    })
  })

  await page.goto('/')
  await page.getByText('Data access').click()
  await page.getByLabel('Free Finnhub key').fill('personal-key')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Add to watchlist' }).click()
  await page.getByRole('button', { name: 'Watchlist 1' }).click()
  await page.getByRole('button', { name: 'Review' }).click()

  await expect(page.getByText('Weekly brief')).toBeVisible()
  await expect(
    page.getByText('Price movement and an upcoming report deserve attention.'),
  ).toBeVisible()
  await expect(
    page.getByText('Experimental patterns', { exact: true }),
  ).toBeVisible()
})
