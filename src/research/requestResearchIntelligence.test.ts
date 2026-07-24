import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import { scoreSecurity } from '../scoring/scoreSecurity'
import {
  createResearchIntelligenceRequest,
  requestResearchIntelligence,
  researchIntelligenceCacheKey,
} from './requestResearchIntelligence'

const security: SecuritySnapshot = {
  symbol: 'IBM',
  name: 'International Business Machines',
  exchange: 'NYSE',
  sector: 'Technology',
  industry: 'Information technology services',
  price: 206.5,
  previousClose: 205.77,
  changePercent: 0.35,
  latestTradingDay: '2026-07-23',
  marketCap: 193_400_209_000,
  peRatio: 18.21,
  priceToBook: 6,
  dividendYield: 0.0319,
  eps: 11.3,
  profitMargin: 0.156,
  returnOnEquity: 0.358,
  revenueGrowth: 0.095,
  earningsGrowth: 0.142,
  operatingMargin: 0.184,
  freeCashFlow: 12_500_000_000,
  debtToEquity: 2.45,
  currentRatio: 1.3,
  beta: 0.675,
  week52High: 332.46,
  week52Low: 204.44,
  metricProvenance: {
    earningsGrowth: {
      source: 'Finnhub',
      asOf: '2026-06-30',
      period: 'TTM',
    },
  },
  source: 'Finnhub',
}

const response = {
  score: 78,
  opinion: 'Promising but mixed',
  summary: 'The supplied evidence supports the thesis with notable constraints.',
  strengths: [{ evidenceId: 'metric:earningsGrowth', text: 'Earnings grew.' }],
  risks: [{ evidenceId: 'fit:valuation', text: 'Valuation is a constraint.' }],
  confidence: 'high',
}

describe('research intelligence client', () => {
  beforeEach(() => window.localStorage.clear())

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds compact grounded evidence without the free-text thesis note', () => {
    const request = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, defaultThesis),
      { ...defaultThesis, note: 'Do not share this note.' },
    )

    expect(request.thesis).not.toHaveProperty('note')
    expect(request.evidence.length).toBeLessThanOrEqual(12)
    expect(request.evidence).toContainEqual(
      expect.objectContaining({
        id: 'metric:earningsGrowth',
        text: expect.stringContaining('Source: Finnhub'),
      }),
    )
    expect(request.evidence).toContainEqual(
      expect.objectContaining({ id: 'fit:valuation' }),
    )
    expect(request.company.snapshot).toBeUndefined()
  })

  it('validates and caches a response for six hours by symbol, thesis, and evidence', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(response)))
    vi.stubGlobal('fetch', fetchMock)
    const request = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, defaultThesis),
      defaultThesis,
    )

    const first = await requestResearchIntelligence(request)
    const second = await requestResearchIntelligence(request)

    expect(first.source).toBe('network')
    expect(second.source).toBe('cache')
    expect(second.score).toBe(78)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/research-intelligence',
      expect.objectContaining({ method: 'POST' }),
    )

    const changedThesisRequest = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, { ...defaultThesis, style: 'value' }),
      { ...defaultThesis, style: 'value' },
    )
    expect(researchIntelligenceCacheKey(changedThesisRequest)).not.toBe(
      researchIntelligenceCacheKey(request),
    )

    vi.mocked(Date.now).mockReturnValue(1_000_000 + 6 * 60 * 60 * 1000 + 1)
    const refreshed = await requestResearchIntelligence(request)
    expect(refreshed.source).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
