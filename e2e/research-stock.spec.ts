import { expect, test, type Page } from '@playwright/test'

const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
})

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
  await page.route('**/api/research-intelligence', async (route) => {
    const body = route.request().postDataJSON() as {
      evidence: Array<{ id: string; text: string }>
    }
    await route.fulfill({
      json: {
        score: 82,
        opinion: 'Compelling',
        summary: 'The supplied evidence strongly supports this thesis.',
        strengths: body.evidence.slice(0, 2).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        risks: body.evidence.slice(-1).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        confidence: 'high',
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Search', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'International Business Machines' }),
  ).toBeVisible()
  await expect(page.locator('.price-line strong')).toHaveText('$206.50')
  await expect(page.locator('.fit-panel > strong')).toHaveText('93')
  await expect(page.getByText('AI evidence score')).toBeVisible()
  await expect(page.getByText('What the evidence suggests')).toBeVisible()
  await expect(page.getByText(/does not predict returns/i)).toBeVisible()
  await expect(page.getByLabel('82 out of 100')).toBeVisible()
  await expect(page.getByText('Compelling', { exact: true })).toBeVisible()
  await expect(page.locator('.data-trust-line')).toContainText(
    'Source: Alpha Vantage',
  )

  await page.getByRole('button', { name: 'Add to watchlist' }).click()
  await page.getByRole('button', { name: 'Watchlist 1' }).click()
  await expect(page.getByRole('heading', { name: 'What deserves your attention?' })).toBeVisible()
  await expect(page.getByText('International Business Machines')).toBeVisible()
})

test('uses SEC filings when Finnhub fundamentals are incomplete', async ({
  page,
}) => {
  await page.route('**/api/research-intelligence', async (route) => {
    const body = route.request().postDataJSON() as {
      evidence: Array<{ id: string; text: string }>
    }
    await route.fulfill({
      json: {
        score: 45,
        opinion: 'Watch closely',
        summary: 'Growth is strong, while profitability evidence is weak.',
        strengths: body.evidence.slice(0, 1).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        risks: body.evidence.slice(-1).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        confidence: 'medium',
      },
    })
  })
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

test('runs grounded AI for a stable watchlist without a price alert', async ({
  page,
}) => {
  await page.route('**/api/research-intelligence', async (route) => {
    const body = route.request().postDataJSON() as {
      evidence: Array<{ id: string; text: string }>
    }
    await route.fulfill({
      json: {
        score: 76,
        opinion: 'Promising but mixed',
        summary: 'The supplied research evidence is supportive.',
        strengths: body.evidence.slice(0, 2).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        risks: body.evidence.slice(-1).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        confidence: 'high',
      },
    })
  })
  await page.route('https://finnhub.io/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/quote')) {
      await route.fulfill({
        json: { c: 206.5, dp: 0.2, pc: 206.1, t: 1784840400 },
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
            epsGrowthTTMYoy: 14.2,
            freeCashFlowTTM: 12500,
            marketCapitalization: 193400.209,
            netProfitMarginTTM: 15.6,
            operatingMarginTTM: 18.4,
            peBasicExclExtraTTM: 18.21,
            revenueGrowthTTMYoy: 9.5,
            roeTTM: 35.8,
            currentRatioQuarterly: 1.3,
            'totalDebt/totalEquityQuarterly': 245,
          },
        },
      })
      return
    }

    if (url.pathname.endsWith('/calendar/earnings')) {
      await route.fulfill({
        json: { earningsCalendar: [] },
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
      stocks: Array<{
        symbol: string
        evidence: Array<{ id: string; text: string }>
      }>
    }
    const stock = body.stocks[0]
    const strengths = stock.evidence.slice(0, 2)
    const risks = stock.evidence.slice(2, 3)

    await route.fulfill({
      json: {
        prioritizedSignalIds: body.deterministicSignals.map(
          (signal) => signal.id,
        ),
        prioritizedEvidenceIds: [],
        summary:
          'The watchlist remains aligned with the thesis and no material business change needs attention.',
        assessments: [
          {
            symbol: stock.symbol,
            score: 79,
            opinion: 'Compelling',
            summary: 'The supplied business evidence remains supportive.',
            strengths: strengths.map((evidence) => ({
              evidenceId: evidence.id,
              text: evidence.text,
            })),
            risks: risks.map((evidence) => ({
              evidenceId: evidence.id,
              text: evidence.text,
            })),
            confidence: 'high',
          },
        ],
        experimentalPatterns: [],
        crossStockPatterns: [],
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
    page.getByText(
      'The watchlist remains aligned with the thesis and no material business change needs attention.',
    ),
  ).toBeVisible()
  await expect(
    page.locator('.watchlist-assessment summary strong'),
  ).toHaveText('79/100 · Compelling')
  await expect(page.getByText('Nothing urgent changed')).toBeVisible()
  await expect(page.getByText(/moved .* sharply/)).toHaveCount(0)
})

test('discovers five non-watchlist companies with grounded AI scores', async ({
  page,
}) => {
  await page.route('**/api/research-intelligence', async (route) => {
    const body = route.request().postDataJSON() as {
      evidence: Array<{ id: string; text: string }>
    }
    await route.fulfill({
      json: {
        score: 80,
        opinion: 'Compelling',
        summary: 'The selected recommendation has supportive evidence.',
        strengths: body.evidence.slice(0, 2).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        risks: body.evidence.slice(-1).map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.text,
        })),
        confidence: 'high',
      },
    })
  })
  await page.route('https://finnhub.io/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const symbol = url.searchParams.get('symbol') ?? 'MSFT'

    if (url.pathname.endsWith('/stock/peers')) {
      await route.fulfill({ json: [] })
      return
    }
    if (url.pathname.endsWith('/quote')) {
      await route.fulfill({
        json: { c: 150, dp: 0.5, pc: 149, t: 1784840400 },
      })
      return
    }
    if (url.pathname.endsWith('/stock/profile2')) {
      await route.fulfill({
        json: {
          exchange: 'NASDAQ',
          finnhubIndustry: 'Technology',
          marketCapitalization: 100000,
          name: `${symbol} Company`,
          ticker: symbol,
        },
      })
      return
    }
    await route.fulfill({
      json: {
        metric: {
          beta: 1,
          epsTTM: 5,
          epsGrowthTTMYoy: 12,
          freeCashFlowTTM: 5000,
          marketCapitalization: 100000,
          netProfitMarginTTM: 20,
          operatingMarginTTM: 22,
          peBasicExclExtraTTM: 24,
          revenueGrowthTTMYoy: 15,
          roeTTM: 25,
          currentRatioQuarterly: 1.5,
          'totalDebt/totalEquityQuarterly': 50,
        },
      },
    })
  })
  await page.route('**/api/recommendation-intelligence', async (route) => {
    const body = route.request().postDataJSON() as {
      thesis: { note?: string }
      candidates: Array<{
        symbol: string
        evidence: Array<{ id: string; text: string }>
      }>
    }
    expect(body.thesis.note).toBeUndefined()
    await route.fulfill({
      json: {
        rankings: body.candidates.map((candidate, index) => ({
          symbol: candidate.symbol,
          score: 88 - index * 4,
          opinion:
            index < 2 ? 'Compelling' : 'Promising but mixed',
          confidence: 'high',
          rationale: candidate.evidence[0].text,
          risk: candidate.evidence.at(-1)?.text ?? candidate.evidence[0].text,
        })),
      },
    })
  })

  await page.goto('/')
  await page.getByText('Data access').click()
  await page.getByLabel('Free Finnhub key').fill('personal-key')
  await page.getByRole('button', { name: 'Discover' }).click()
  await page.getByRole('button', { name: 'Refresh ideas' }).click()

  await expect(page.locator('.discover-card')).toHaveCount(5)
  await expect(page.getByText('Phi-ranked')).toBeVisible()
  await expect(page.getByText('AI evidence 88', { exact: false })).toBeVisible()

  const firstRecommendation = page.locator('.discover-card').first()
  const companyName = await firstRecommendation.locator('h2').textContent()
  await firstRecommendation.getByRole('button', { name: 'Research' }).click()
  await expect(
    page.getByRole('heading', { name: companyName ?? '' }),
  ).toBeVisible()
})
