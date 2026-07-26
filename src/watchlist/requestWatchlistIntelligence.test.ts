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

const claim = (text: string, evidenceId: string) => ({
  text,
  citationIds: [evidenceId],
  citations: [
    {
      evidenceId,
      symbol: 'TEST',
      text: 'Verified TEST evidence.',
    },
  ],
})

const intelligenceResponse = {
  overallOpinion: 'Mixed',
  overallSummary: claim(
    'Current business evidence remains consistent with the saved thesis.',
    'stock-evidence:test:growth-quality',
  ),
  prioritizedSignalIds: [],
  prioritizedEvidenceIds: ['stock-evidence:test:growth-quality'],
  prioritizedEvidence: [
    {
      evidenceId: 'stock-evidence:test:growth-quality',
      symbol: 'TEST',
      text: 'Verified TEST evidence.',
    },
  ],
  stocks: [
    {
      symbol: 'TEST',
      opinion: 'Mixed',
      whatChanged: claim(
        'No material change',
        'stock-evidence:test:context',
      ),
      whyItFits: [
        claim(
          'Growth and quality evidence is stable.',
          'stock-evidence:test:growth-quality',
        ),
      ],
      concerns: [
        claim(
          'Valuation and balance-sheet evidence is mixed.',
          'stock-evidence:test:valuation-balance',
        ),
      ],
      whatToWatchNext: [
        claim('Review the next filing.', 'stock-evidence:test:context'),
      ],
      confidence: 'medium',
    },
  ],
  crossStockPatterns: [],
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
    expect(result.stockOpinions[0]).toMatchObject({
      symbol: 'TEST',
      opinion: 'Mixed',
      confidence: 'medium',
    })
    expect(result.stockOpinions[0].whatChanged.text).toBe('No material change')
    expect(result.prioritizedEvidence).toHaveLength(1)
  })

  it('includes a non-empty free-text note automatically', () => {
    const watchlist = watched()
    const brief = generateWatchlistBrief(watchlist)

    expect(
      createWatchlistIntelligencePacket(
        watchlist,
        brief,
        { ...defaultThesis, note: 'Private conviction' },
      ).thesis.note,
    ).toBe('Private conviction')
    expect(
      createWatchlistIntelligencePacket(
        watchlist,
        brief,
        defaultThesis,
      ).thesis.note,
    ).toBeUndefined()
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
    const errorBody =
      status === 429
        ? {
            error: 'Watchlist opinion limit reached.',
            code: 'INTELLIGENCE_LIMIT_REACHED',
            retryable: true,
          }
        : {
            error: 'Intelligence is temporarily unavailable.',
            code: 'INTELLIGENCE_UNAVAILABLE',
            retryable: true,
          }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(errorBody), { status }),
        ),
    )

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(result.modelStatus).toBe(expected)
    expect(result.deterministicInsights).toEqual(brief.deterministicInsights)
    expect(result.stockOpinions).toEqual([])
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
      modelOverallOpinion: 'Fits thesis' as const,
    }

    expect(
      applyWatchlistIntelligenceResult(
        current,
        '2026-07-23T12:00:00.000Z',
        generated,
      ),
    ).toBe(current)
  })

  it('falls back when a refusal or malformed response fails the strict schema', async () => {
    const watchlist = watched()
    const brief = generateWatchlistBrief(watchlist)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...intelligenceResponse,
            score: 75,
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await requestWatchlistIntelligence(
      watchlist,
      brief,
      defaultThesis,
    )

    expect(result.modelStatus).toBe('fallback')
    expect(result.deterministicInsights).toEqual(brief.deterministicInsights)
    expect(result.modelOverallOpinion).toBeNull()
  })
})
