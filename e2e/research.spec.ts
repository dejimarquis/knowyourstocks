import type { Route } from '@playwright/test'
import {
  expect,
  researchResponse,
  storageKeys,
  test,
} from './helpers/appHarness'

test.describe('Research intelligence', () => {
  test.beforeEach(async ({ harness }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
  })

  test('persists a thesis note and renders grounded opinion sections beside deterministic Fit', async ({
    page,
    harness,
  }) => {
    const note =
      'I favor durable AI infrastructure with strong cash flow and manageable leverage.'
    await harness.mockResearch((_route, body) => {
      expect((body.thesis as { note?: string }).note).toBe(note)
      return { json: researchResponse('IBM') }
    })

    await harness.goto()
    await page.getByText('Personalize your results').click()
    await page.getByLabel('What do you believe?').fill(note)
    await page.getByRole('button', { name: 'Save thesis' }).click()
    await expect(page.getByText(/Saved in this browser/)).toBeVisible()
    await harness.research('IBM')

    await expect(page.locator('.fit-panel > strong')).toHaveText(/\d+/)
    await expect(page.getByText(/deterministic Fit compares/)).toBeVisible()
    await expect(page.getByText('Opinion', { exact: true })).toBeVisible()
    await expect(page.getByText('Mixed', { exact: true })).toBeVisible()
    await expect(page.getByText(researchResponse('IBM').headline)).toBeVisible()
    await expect(
      page.getByText('The grounded evidence supports the thesis with important constraints.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Why it fits' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Concerns' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'What to watch next' }),
    ).toBeVisible()
    await page.locator('.research-intelligence').getByText('Sources (1)').first().click()
    await expect(page.getByText('Verified IBM evidence.').first()).toBeVisible()
    await expect(page.getByText(/AI evidence score/i)).toHaveCount(0)
    await expect
      .poll(() => harness.researchRequests.length)
      .toBe(1)
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), storageKeys.thesis),
      )
      .toContain(note)
  })

  test('reloads a fresh model opinion from cache without another AI request', async ({
    page,
    harness,
  }) => {
    await harness.mockResearch({ json: researchResponse('IBM') })
    await harness.goto()
    await harness.research('IBM')
    await expect(page.getByText(researchResponse('IBM').headline)).toBeVisible()

    await page.reload()

    await expect(page.getByText(researchResponse('IBM').headline)).toBeVisible()
    await expect(page.getByText(/Loaded from the six-hour local cache/)).toBeVisible()
    expect(harness.researchRequests).toHaveLength(1)
  })

  test('requests again when the model cache is missing or expired', async ({
    page,
    harness,
  }) => {
    await harness.mockResearch({ json: researchResponse('IBM') })
    await harness.goto()
    await harness.research('IBM')
    await expect(page.getByText(researchResponse('IBM').headline)).toBeVisible()

    await page.evaluate((prefix) => {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (key?.startsWith(prefix)) localStorage.removeItem(key)
      }
    }, storageKeys.researchCachePrefix)
    await page.reload()
    await expect.poll(() => harness.researchRequests.length).toBe(2)

    await page.evaluate((prefix) => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key?.startsWith(prefix)) continue
        const value = JSON.parse(localStorage.getItem(key) ?? '{}')
        value.fetchedAt = Date.now() - 7 * 60 * 60 * 1000
        localStorage.setItem(key, JSON.stringify(value))
      }
    }, storageKeys.researchCachePrefix)
    await page.reload()

    await expect.poll(() => harness.researchRequests.length).toBe(3)
    await expect(page.getByText(/Cached locally for up to six hours/)).toBeVisible()
  })

  const failures = [
    {
      name: '503',
      status: 503,
      body: {
        error: 'Research intelligence is unavailable.',
        code: 'INTELLIGENCE_UNAVAILABLE',
        retryable: true,
      },
      title: 'Model opinion could not load',
      retry: true,
    },
    {
      name: '429',
      status: 429,
      body: {
        error: 'Research opinion limit reached.',
        code: 'INTELLIGENCE_LIMIT_REACHED',
        retryable: true,
      },
      title: 'Model opinion limit reached',
      retry: true,
    },
    {
      name: 'malformed response',
      status: 200,
      body: { opinion: 'Mixed', headline: '' },
      title: 'Model opinion could not load',
      retry: true,
    },
    {
      name: 'refusal-style invalid request',
      status: 400,
      body: {
        error: 'The model declined this request.',
        code: 'INVALID_REQUEST',
        retryable: false,
      },
      title: 'Model opinion could not load',
      retry: false,
    },
  ] as const

  for (const failure of failures) {
    test(`keeps data and Fit with truthful fallback for ${failure.name}`, async ({
      page,
      harness,
    }) => {
      if (failure.status >= 400) {
        harness.expectHttpFailure('/api/research-intelligence', failure.status)
      }
      await harness.mockResearch({
        status: failure.status,
        json: failure.body,
      })
      await harness.goto()
      await harness.research('IBM')

      await expect(page.locator('.fit-panel > strong')).toHaveText(/\d+/)
      await expect(page.getByText(failure.title)).toBeVisible()
      await expect(
        page.getByText(/company data and deterministic Fit above remain available/),
      ).toBeVisible()
      await expect(page.getByText(researchResponse('IBM').headline)).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Try model opinion again' }),
      ).toHaveCount(failure.retry ? 1 : 0)
    })
  }

  test('keeps data and Fit when the model request is aborted', async ({
    page,
    harness,
  }) => {
    harness.expectRequestFailure('/api/research-intelligence')
    await harness.mockResearch(async (route) => {
      await route.abort('failed')
    })
    await harness.goto()
    await harness.research('IBM')

    await expect(page.locator('.fit-panel > strong')).toHaveText(/\d+/)
    await expect(page.getByText('Model opinion could not load')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Try model opinion again' }),
    ).toBeVisible()
    await expect(page.getByText(researchResponse('IBM').headline)).toHaveCount(0)
  })

  test('never paints a stale model response after researching a second symbol', async ({
    page,
    harness,
  }) => {
    let firstRoute: Route | null = null
    await harness.mockResearch((route, body) => {
      if (body.symbol === 'IBM') {
        firstRoute = route
        return
      }
      return { json: researchResponse('MSFT') }
    })
    await harness.goto()
    await harness.research('IBM')
    await expect(page.getByText(/Reviewing the supplied evidence/)).toBeVisible()

    await harness.research('MSFT')
    await expect(page.getByText(researchResponse('MSFT').headline)).toBeVisible()
    expect(firstRoute).not.toBeNull()
    await firstRoute!.fulfill({
      json: researchResponse('IBM', {
        headline: 'STALE IBM OUTPUT MUST NEVER PAINT',
      }),
    })

    await page.waitForTimeout(100)
    await expect(page.getByText('STALE IBM OUTPUT MUST NEVER PAINT')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Microsoft' }),
    ).toBeVisible()
  })
})

test.describe('SEC research fallback', () => {
  test.beforeEach(async ({ harness }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockResearch((_route, body) => ({
      json: researchResponse(String(body.symbol)),
    }))
  })

  test('fills missing fundamentals from a real-shaped SEC response', async ({
    page,
    harness,
  }) => {
    await harness.mockFinnhub({
      snapshots: {
        AMD: {
          eps: null,
          profitMargin: null,
          returnOnEquity: null,
          revenueGrowth: null,
          earningsGrowth: null,
        },
      },
    })
    await harness.mockSec({
      json: {
        symbol: 'AMD',
        cik: '0000002488',
        companyName: 'Advanced Micro Devices',
        filingDate: '2026-06-30',
        revenue: 8_000_000_000,
        revenueGrowth: 0.31,
        netIncome: 1_200_000_000,
        profitMargin: 0.15,
        epsAnnualized: 3.25,
        earningsGrowth: 0.28,
        stockholdersEquity: 60_000_000_000,
        returnOnEquity: 0.2,
        source: 'SEC EDGAR',
      },
    })
    await harness.goto()
    await harness.research('AMD')

    await expect(page.getByText(/Source: Finnhub \+ SEC EDGAR/)).toBeVisible()
    await expect(
      page.locator('.metric-grid details').nth(2).getByText('15%', { exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('.metric-grid details').nth(3).getByText('31%', { exact: true }),
    ).toBeVisible()
  })

  for (const status of [404, 502]) {
    test(`gracefully keeps provider data when SEC returns ${status}`, async ({
      page,
      harness,
    }) => {
      harness.expectHttpFailure('/api/sec-fundamentals/AMD', status)
      await harness.mockFinnhub({
        snapshots: {
          AMD: {
            eps: null,
            profitMargin: null,
            returnOnEquity: null,
            revenueGrowth: null,
            earningsGrowth: null,
          },
        },
      })
      await harness.mockSec({
        status,
        json: { error: `SEC mocked ${status}` },
      })
      await harness.goto()
      await harness.research('AMD')

      await expect(page.getByText(/Source: Finnhub ·/)).toBeVisible()
      await expect(page.locator('.fit-panel > strong')).toHaveText(/\d+|—/)
      await expect(page.getByText(researchResponse('AMD').headline)).toBeVisible()
      await expect(page.getByText(/SEC mocked/)).toHaveCount(0)
    })
  }
})
