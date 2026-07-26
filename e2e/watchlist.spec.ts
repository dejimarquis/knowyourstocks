import type { Route } from '@playwright/test'
import {
  defaultThesis,
  emptyWatchlist,
  expect,
  makeFit,
  makeSnapshot,
  makeWatchlistItem,
  researchResponse,
  storageKeys,
  test,
  watchlistIntelligenceResponse,
} from './helpers/appHarness'

const minimalBrief = (
  status:
    | 'not_requested'
    | 'fallback'
    | 'disabled'
    | 'rate_limited',
) => ({
  generatedAt: new Date().toISOString(),
  reviewType: 'manual',
  deterministicInsights: [],
  experimentalInsights: [],
  stableSymbols: ['IBM'],
  errors: [],
  prioritizedSignalIds: [],
  prioritizedEvidenceIds: [],
  prioritizedEvidence: [],
  modelOverallOpinion: null,
  modelOverallSummary: null,
  stockOpinions: [],
  crossStockPatterns: [],
  modelStatus: status,
})

test.describe('Watchlist persistence and review', () => {
  test('toggles a researched stock, persists its badge and row, then removes it', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockResearch({ json: researchResponse('IBM') })
    await harness.goto()
    await harness.research('IBM')

    await page.getByRole('button', { name: 'Add to watchlist' }).click()
    await expect(page.getByRole('button', { name: 'Watchlist 1' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Watchlist 1' }).click()
    await expect(page.getByText('International Business Machines')).toBeVisible()

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Your watchlist is empty.')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Watchlist', exact: true }),
    ).toBeVisible()
    await page.reload()
    await page
      .getByRole('button', { name: 'Watchlist', exact: true })
      .click()
    await expect(page.getByText('Your watchlist is empty.')).toBeVisible()
  })

  test('shows a useful empty state', async ({ page, harness }) => {
    await harness.goto()
    await page.getByRole('button', { name: 'Watchlist' }).click()

    await expect(page.getByText('Your watchlist is empty.')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Research a stock' }),
    ).toBeVisible()
  })

  test('runs a stable review with exact No material change and per-stock citations', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      local: {
        [storageKeys.watchlist]: {
          ...emptyWatchlist,
          items: [makeWatchlistItem('IBM')],
        },
      },
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockWatchlistIntelligence((_route, rawBody) => {
      const response = watchlistIntelligenceResponse(
        rawBody as Parameters<typeof watchlistIntelligenceResponse>[0],
      )
      response.stocks[0].whatChanged.text = 'No material change'
      return { json: response }
    })
    await harness.goto()
    await page.getByRole('button', { name: 'Watchlist 1' }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()

    await expect(page.getByText('Nothing urgent changed')).toBeVisible()
    await expect(page.getByText('Current evidence remains consistent with the saved thesis.')).toBeVisible()
    await expect(page.getByText('Priority sources (1)')).toBeVisible()
    await page.locator('details.watchlist-opinion > summary').click()
    await expect(page.getByText('No material change', { exact: true })).toBeVisible()
    await expect(page.getByText('Why it fits', { exact: true })).toBeVisible()
    await expect(page.getByText('Concerns', { exact: true })).toBeVisible()
    await expect(page.getByText('What to watch next', { exact: true })).toBeVisible()
    await page.locator('.watchlist-opinion').getByText('Sources (1)').first().click()
    await expect(page.getByText('Verified IBM evidence.').first()).toBeVisible()
    await expect(page.getByText(/\/100/)).toHaveCount(0)
  })

  test('renders deterministic change signals and a grounded cross-stock pattern', async ({
    page,
    harness,
  }) => {
    await harness.seedStorage({
      local: {
        [storageKeys.watchlist]: {
          ...emptyWatchlist,
          items: [makeWatchlistItem('IBM'), makeWatchlistItem('MSFT')],
        },
      },
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub({
      snapshots: {
        IBM: {
          revenueGrowth: 0.42,
          profitMargin: 0.08,
          operatingMargin: 0.1,
          peRatio: 40,
        },
      },
    })
    await harness.mockWatchlistIntelligence((_route, rawBody) => ({
      json: watchlistIntelligenceResponse(
        rawBody as Parameters<typeof watchlistIntelligenceResponse>[0],
        true,
      ),
    }))
    await harness.goto()
    await page.getByRole('button', { name: 'Watchlist 2' }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()

    await expect(
      page.locator('.brief-list summary span', {
        hasText: 'IBM fundamentals changed',
      }),
    ).toBeVisible()
    await expect(
      page.locator('.brief-list summary span', {
        hasText: 'IBM valuation changed materially',
      }),
    ).toBeVisible()
    await page.getByText('Shared margin sensitivity').click()
    await expect(
      page.getByText('Margins are the main shared evidence gap.'),
    ).toBeVisible()
    await expect(
      page.getByText('Confidence: medium', { exact: true }),
    ).toBeVisible()
  })

  for (const [status, message] of [
    [
      'not_requested',
      'No compatible model opinion is stored for this review. Run Review to request one.',
    ],
    [
      'fallback',
      'The deterministic brief is shown. The model was unavailable or its response did not pass evidence checks, so no opinion was added.',
    ],
    [
      'disabled',
      'AI opinion was disabled for this review. Only the deterministic brief was generated.',
    ],
    [
      'rate_limited',
      'The AI review limit was reached. Only the deterministic brief was generated.',
    ],
  ] as const) {
    test(`renders the ${status} model state truthfully`, async ({
      page,
      harness,
    }) => {
      await harness.seedStorage({
        local: {
          [storageKeys.watchlist]: {
            ...emptyWatchlist,
            items: [makeWatchlistItem('IBM')],
            lastReviewAt: '2026-07-23T12:00:00.000Z',
            latestBrief: minimalBrief(status),
            modelPreferences: { enablePhi: status !== 'disabled' },
          },
        },
      })
      await harness.goto()
      await page.getByRole('button', { name: 'Watchlist 1' }).click()

      await expect(page.getByText(message)).toBeVisible()
      await expect(page.getByText('Model opinion', { exact: true })).toHaveCount(0)
    })
  }

  test('locks Discover watchlist changes during an active review', async ({
    page,
    harness,
  }) => {
    const currentSymbol = 'IBM'
    const fingerprint = JSON.stringify({
      universeVersion: 1,
      thesis: defaultThesis,
      watchedSymbols: ['IBM'],
      recentSymbols: ['IBM'],
      currentSymbol,
    })
    const discoverResult = {
      version: 2,
      universeVersion: 1,
      generatedAt: new Date().toISOString(),
      modelStatus: 'fallback',
      providerErrors: 0,
      recommendations: [
        {
          snapshot: makeSnapshot('AAPL'),
          fit: makeFit(),
          opinion: null,
          thesisRationale: 'Deterministic Apple rationale.',
          mainConcern: 'Deterministic Apple concern.',
          whatToResearchNext: 'Read the next Apple filing.',
          confidence: null,
          citations: [],
        },
      ],
    }
    await harness.seedStorage({
      local: {
        [storageKeys.watchlist]: {
          ...emptyWatchlist,
          items: [makeWatchlistItem('IBM')],
        },
        [storageKeys.lastSecurity]: {
          fetchedAt: Date.now(),
          security: makeSnapshot('IBM'),
        },
        [storageKeys.discoverCache]: {
          schemaVersion: 2,
          fingerprint,
          result: discoverResult,
        },
      },
      session: { [storageKeys.finnhubKey]: 'e2e-key' },
    })
    await harness.mockFinnhub()
    await harness.mockResearch({ json: researchResponse('IBM') })
    let pendingRoute: Route | null = null
    let pendingBody:
      | Parameters<typeof watchlistIntelligenceResponse>[0]
      | null = null
    await harness.mockWatchlistIntelligence((route, rawBody) => {
      pendingRoute = route
      pendingBody =
        rawBody as Parameters<typeof watchlistIntelligenceResponse>[0]
    })
    await harness.goto()
    await page.getByRole('button', { name: 'Watchlist 1' }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await expect.poll(() => pendingRoute !== null).toBe(true)

    await page.getByRole('button', { name: 'Discover' }).click()
    await expect(
      page.getByRole('button', { name: 'Review in progress' }),
    ).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Watchlist 1' })).toBeVisible()
    await pendingRoute!.fulfill({
      json: watchlistIntelligenceResponse(pendingBody!),
    })
    await page.getByRole('button', { name: 'Watchlist 1' }).click()
    await expect(
      page.getByText('Current evidence remains consistent with the saved thesis.'),
    ).toBeVisible()
  })
})
