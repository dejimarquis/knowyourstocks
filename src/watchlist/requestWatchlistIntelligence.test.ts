import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultThesis } from '../domain/thesis'
import {
  createWatchlistItem,
  emptyWatchlist,
  type Watchlist,
} from '../domain/watchlist'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { scoreSecurity } from '../scoring/scoreSecurity'
import { generateWatchlistBrief } from './generateWatchlistBrief'
import { requestWatchlistIntelligence } from './requestWatchlistIntelligence'

const snapshot: SecuritySnapshot = {
  symbol: 'TEST',
  name: 'Test Company',
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
  changePercent: 6,
  latestTradingDay: '2026-07-23',
  marketCap: 10_000_000_000,
  peRatio: 20,
  priceToBook: 3,
  dividendYield: null,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.15,
  earningsGrowth: 0.1,
  beta: 1,
  week52High: 120,
  week52Low: 80,
  source: 'Test',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestWatchlistIntelligence', () => {
  it('omits the free-text note unless the user opts in', async () => {
    const watchlist: Watchlist = {
      ...emptyWatchlist,
      items: [
        createWatchlistItem(
          snapshot,
          scoreSecurity(snapshot, defaultThesis),
        ),
      ],
    }
    const brief = generateWatchlistBrief(watchlist)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          prioritizedSignalIds: [],
          summary: 'Rules remain the primary source.',
          experimentalPatterns: [],
          uncertainties: [],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await requestWatchlistIntelligence(
      watchlist,
      brief,
      { ...defaultThesis, note: 'Private conviction' },
    )

    const firstBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    ) as {
      thesis: { note?: string }
      watchlist?: unknown
      stableSymbols?: unknown
    }
    expect(firstBody.thesis.note).toBeUndefined()
    expect(firstBody.watchlist).toBeUndefined()
    expect(firstBody.stableSymbols).toBeUndefined()

    await requestWatchlistIntelligence(
      {
        ...watchlist,
        modelPreferences: { includeThesisNote: true, enablePhi: true },
      },
      brief,
      { ...defaultThesis, note: 'Private conviction' },
    )
    const secondBody = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ) as { thesis: { note?: string } }
    expect(secondBody.thesis.note).toBe('Private conviction')
  })

  it('does not call Phi when model enhancement is disabled', async () => {
    const watchlist: Watchlist = {
      ...emptyWatchlist,
      modelPreferences: {
        includeThesisNote: false,
        enablePhi: false,
      },
      items: [
        createWatchlistItem(
          snapshot,
          scoreSecurity(snapshot, defaultThesis),
        ),
      ],
    }
    const brief = generateWatchlistBrief(watchlist)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.modelStatus).toBe('not_requested')
  })

  it('does not spend model quota for a stable brief with no signals', async () => {
    const stableSnapshot = { ...snapshot, changePercent: 1 }
    const watchlist: Watchlist = {
      ...emptyWatchlist,
      items: [
        createWatchlistItem(
          stableSnapshot,
          scoreSecurity(stableSnapshot, defaultThesis),
        ),
      ],
    }
    const brief = generateWatchlistBrief(watchlist)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(brief.deterministicInsights).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.modelStatus).toBe('not_requested')
  })

  it('falls back to the deterministic brief when the endpoint fails', async () => {
    const watchlist: Watchlist = {
      ...emptyWatchlist,
      items: [
        createWatchlistItem(
          snapshot,
          scoreSecurity(snapshot, defaultThesis),
        ),
      ],
    }
    const brief = generateWatchlistBrief(watchlist)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    )

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(result.modelStatus).toBe('fallback')
    expect(result.deterministicInsights).toEqual(
      brief.deterministicInsights,
    )
  })
})
