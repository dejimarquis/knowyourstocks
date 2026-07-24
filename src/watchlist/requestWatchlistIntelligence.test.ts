import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import {
  createWatchlistItem,
  emptyWatchlist,
  type Watchlist,
} from '../domain/watchlist'
import { scoreSecurity } from '../scoring/scoreSecurity'
import { generateWatchlistBrief } from './generateWatchlistBrief'
import {
  applyWatchlistIntelligenceResult,
  createWatchlistIntelligencePacket,
  prepareWatchlistIntelligenceBrief,
  requestWatchlistIntelligence,
} from './requestWatchlistIntelligence'

const snapshot: SecuritySnapshot = {
  symbol: 'TEST',
  name: 'Test Company',
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
  changePercent: 1,
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
  operatingMargin: 0.22,
  freeCashFlow: 1_000_000_000,
  debtToEquity: 0.5,
  currentRatio: 1.8,
  beta: 1,
  week52High: 120,
  week52Low: 80,
  fundamentalsAsOf: '2026-06-30',
  metricProvenance: {
    earningsGrowth: {
      source: 'Finnhub',
      asOf: '2026-06-30',
      period: 'TTM',
    },
  },
  source: 'Test',
}

const watched = (enabled = true): Watchlist => {
  const item = createWatchlistItem(
    snapshot,
    scoreSecurity(snapshot, defaultThesis),
    new Date('2026-07-23T12:00:00Z'),
  )
  return {
    ...emptyWatchlist,
    lastReviewAt: '2026-07-23T12:00:00.000Z',
    modelPreferences: {
      includeThesisNote: false,
      enablePhi: enabled,
    },
    items: [
      {
        ...item,
        previousSnapshot: { ...snapshot },
        previousFit: scoreSecurity(snapshot, defaultThesis),
        earningsDate: '2026-09-30',
      },
    ],
  }
}

const intelligenceResponse = {
  prioritizedSignalIds: [],
  prioritizedEvidenceIds: [],
  summary: 'Current business evidence remains consistent with the saved thesis.',
  assessments: [
    {
      symbol: 'TEST',
      score: 76,
      opinion: 'Promising but mixed',
      summary: 'Business quality is supported, with valuation evidence still mixed.',
      strengths: [
        {
          evidenceId: 'stock-evidence:test:growth-quality',
          text: 'Growth and quality evidence is stable.',
        },
      ],
      risks: [
        {
          evidenceId: 'stock-evidence:test:valuation-balance',
          text: 'Valuation and balance-sheet evidence is mixed.',
        },
      ],
      confidence: 'medium',
    },
  ],
  experimentalPatterns: [],
  crossStockPatterns: [],
  uncertainties: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestWatchlistIntelligence', () => {
  it('calls Phi for a stable review and includes evidence for every stock', async () => {
    const watchlist = watched()
    const brief = generateWatchlistBrief(
      watchlist,
      new Date('2026-07-23T12:00:00Z'),
    )
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(intelligenceResponse), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(brief.deterministicInsights).toEqual([])
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      version: number
      stocks: Array<{ evidence: Array<{ id: string; text: string }> }>
    }
    expect(body.version).toBe(2)
    expect(body.stocks).toHaveLength(1)
    expect(body.stocks[0].evidence.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'stock-evidence:test:growth-quality',
        'stock-evidence:test:valuation-balance',
        'stock-evidence:test:fit',
        'stock-evidence:test:context',
      ]),
    )
    expect(body.stocks[0].evidence.find((item) => item.id.endsWith(':context'))?.text)
      .toContain('no stock-specific change signal')
    expect(result.modelStatus).toBe('generated')
    expect(result.aiAssessments[0]).toMatchObject({
      symbol: 'TEST',
      score: 76,
      confidence: 'medium',
    })
  })

  it('omits the free-text note unless the user opts in', () => {
    const watchlist = watched()
    const brief = generateWatchlistBrief(watchlist)

    expect(
      createWatchlistIntelligencePacket(
        watchlist,
        brief,
        { ...defaultThesis, note: 'Private conviction' },
      ).thesis.note,
    ).toBeUndefined()
    expect(
      createWatchlistIntelligencePacket(
        {
          ...watchlist,
          modelPreferences: { includeThesisNote: true, enablePhi: true },
        },
        brief,
        { ...defaultThesis, note: 'Private conviction' },
      ).thesis.note,
    ).toBe('Private conviction')
  })

  it('does not call Phi when model enhancement is disabled', async () => {
    const watchlist = watched(false)
    const brief = generateWatchlistBrief(watchlist)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.modelStatus).toBe('disabled')
  })

  it.each([
    [503, 'fallback'],
    [429, 'rate_limited'],
  ] as const)('preserves the deterministic brief for HTTP %s', async (status, expected) => {
    const watchlist = watched()
    const brief = generateWatchlistBrief(watchlist)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status })),
    )

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(result.modelStatus).toBe(expected)
    expect(result.deterministicInsights).toEqual(brief.deterministicInsights)
    expect(result.aiAssessments).toEqual([])
  })

  it('marks the deterministic brief while model work is pending', () => {
    const brief = generateWatchlistBrief(watched())

    expect(prepareWatchlistIntelligenceBrief(brief, true).modelStatus).toBe(
      'loading',
    )
    expect(prepareWatchlistIntelligenceBrief(brief, false).modelStatus).toBe(
      'disabled',
    )
  })

  it('rejects a stale async result after a newer review starts', () => {
    const current = {
      ...watched(),
      lastReviewAt: '2026-07-24T12:00:00.000Z',
    }
    const generated = {
      ...generateWatchlistBrief(current),
      modelStatus: 'generated' as const,
      aiSummary: 'Older result',
    }

    expect(
      applyWatchlistIntelligenceResult(
        current,
        '2026-07-23T12:00:00.000Z',
        generated,
      ),
    ).toBe(current)
  })
})
