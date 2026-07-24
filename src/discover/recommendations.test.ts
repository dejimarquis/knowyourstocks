import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import {
  discoverRecommendations,
  requestRecommendationIntelligence,
  selectDiscoverCandidateSymbols,
} from './recommendations'

const snapshot = (
  symbol: string,
  overrides: Partial<SecuritySnapshot> = {},
): SecuritySnapshot => ({
  symbol,
  name: `${symbol} Incorporated`,
  exchange: 'NASDAQ',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
  changePercent: 1,
  latestTradingDay: '2026-07-23',
  marketCap: 100_000_000_000,
  peRatio: 24,
  priceToBook: 5,
  dividendYield: 0.01,
  eps: 5,
  profitMargin: 0.2,
  returnOnEquity: 0.25,
  revenueGrowth: 0.15,
  earningsGrowth: 0.18,
  operatingMargin: 0.22,
  freeCashFlow: 5_000_000_000,
  debtToEquity: 0.5,
  currentRatio: 1.5,
  beta: 1.1,
  week52High: 110,
  week52Low: 70,
  fundamentalsAsOf: null,
  metricProvenance: {},
  source: 'Finnhub',
  ...overrides,
})

const rankings = (candidates: Array<{ snapshot: SecuritySnapshot }>) =>
  candidates.map((candidate) => ({
    symbol: candidate.snapshot.symbol,
    score: 80,
    opinion: 'Compelling' as const,
    confidence: 'high' as const,
    rationale: `${candidate.snapshot.symbol} matches supplied evidence.`,
    risk: `${candidate.snapshot.symbol} has supplied risk evidence.`,
  }))

describe('discover recommendations', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('excludes watched and current symbols and ignores peers outside the universe', () => {
    const symbols = selectDiscoverCandidateSymbols(
      defaultThesis,
      ['NVDA', 'FAKE', 'MSFT'],
      ['NVDA'],
      'MSFT',
    )

    expect(symbols).not.toContain('NVDA')
    expect(symbols).not.toContain('MSFT')
    expect(symbols).not.toContain('FAKE')
    expect(symbols).toHaveLength(8)
  })

  it('fetches no more than eight candidates and never accepts an invented snapshot', async () => {
    const fetchSecurity = vi.fn(async (symbol: string) =>
      symbol === 'NVDA' ? snapshot('FAKE') : snapshot(symbol),
    )

    const result = await discoverRecommendations(
      {
        thesis: defaultThesis,
        watchedSymbols: [],
        finnhubKey: 'key',
        currentSymbol: 'AAPL',
      },
      {
        fetchPeers: vi.fn(async () => ['NVDA', 'NOTREAL']),
        fetchSecurity,
        enrichSecurity: vi.fn(async (security) => security),
        requestIntelligence: vi.fn(async (_thesis, candidates) =>
          rankings(candidates),
        ),
      },
    )

    expect(fetchSecurity).toHaveBeenCalledTimes(8)
    expect(result.recommendations.map((item) => item.snapshot.symbol)).not.toContain(
      'FAKE',
    )
    expect(result.providerErrors).toBeGreaterThan(0)
  })

  it('returns partial results when individual provider requests fail', async () => {
    let call = 0
    const result = await discoverRecommendations(
      {
        thesis: defaultThesis,
        watchedSymbols: [],
        finnhubKey: 'key',
      },
      {
        fetchPeers: vi.fn(async () => {
          throw new Error('peers unavailable')
        }),
        fetchSecurity: vi.fn(async (symbol: string) => {
          call += 1
          if (call > 3) {
            throw new Error('quote unavailable')
          }
          return snapshot(symbol)
        }),
        enrichSecurity: vi.fn(async (security) => security),
        requestIntelligence: vi.fn(),
      },
    )

    expect(result.recommendations).toHaveLength(3)
    expect(result.modelStatus).toBe('not_requested')
    expect(result.providerErrors).toBe(5)
  })

  it('falls back to the deterministic top five when Phi fails', async () => {
    const result = await discoverRecommendations(
      {
        thesis: defaultThesis,
        watchedSymbols: [],
        finnhubKey: 'key',
      },
      {
        fetchPeers: vi.fn(async () => []),
        fetchSecurity: vi.fn(async (symbol: string) => snapshot(symbol)),
        enrichSecurity: vi.fn(async (security) => security),
        requestIntelligence: vi.fn(async () => {
          throw new Error('Phi unavailable')
        }),
      },
    )

    expect(result.modelStatus).toBe('fallback')
    expect(result.recommendations).toHaveLength(5)
    expect(result.recommendations.every((item) => item.aiScore == null)).toBe(true)
  })

  it('sends exactly five supplied candidates to the ranking endpoint', async () => {
    const candidates = ['MSFT', 'NVDA', 'GOOGL', 'META', 'AVGO'].map(
      (symbol) => ({
        snapshot: snapshot(symbol),
        fit: {
          total: 80,
          label: 'Strong match' as const,
          factors: [
            {
              key: 'quality',
              label: 'Quality',
              earned: 10,
              maximum: 10,
              evidence: 'Quality evidence is available.',
              available: true,
            },
          ],
          missing: [],
        },
      }),
    )
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        candidates: Array<{ symbol: string }>
      }
      return new Response(
        JSON.stringify({
          rankings: body.candidates.map((candidate) => ({
            symbol: candidate.symbol,
            score: 80,
            opinion: 'Compelling',
            confidence: 'high',
            rationale: 'Supplied evidence supports the comparison.',
            risk: 'Supplied evidence identifies uncertainty.',
          })),
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestRecommendationIntelligence(defaultThesis, candidates)

    const request = fetchMock.mock.calls[0][1]
    const body = JSON.parse(String(request?.body)) as {
      candidates: Array<{ symbol: string }>
    }
    expect(body.candidates).toHaveLength(5)
    expect(body.candidates.map((candidate) => candidate.symbol)).toEqual(
      candidates.map((candidate) => candidate.snapshot.symbol),
    )
  })
})
