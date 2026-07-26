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
  opinion: 'Mixed',
  headline: 'Quality evidence is constructive, with valuation still mixed.',
  reasoningSummary: {
    text: 'The supplied evidence supports the thesis with notable constraints.',
    citationIds: ['metric:earningsGrowth'],
    citations: [
      {
        evidenceId: 'metric:earningsGrowth',
        symbol: 'IBM',
        text: 'Earnings growth: 14.2%.',
      },
    ],
  },
  whyItFits: [
    {
      text: 'Earnings growth supports the thesis.',
      citationIds: ['metric:earningsGrowth'],
      citations: [
        {
          evidenceId: 'metric:earningsGrowth',
          symbol: 'IBM',
          text: 'Earnings growth: 14.2%.',
        },
      ],
    },
  ],
  concerns: [],
  whatToWatchNext: [],
  confidence: 'high',
  uncertainty: {
    text: 'Future operating results remain uncertain.',
    citationIds: ['metric:earningsGrowth'],
    citations: [
      {
        evidenceId: 'metric:earningsGrowth',
        symbol: 'IBM',
        text: 'Earnings growth: 14.2%.',
      },
    ],
  },
}

describe('research intelligence client', () => {
  beforeEach(() => window.localStorage.clear())

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds compact grounded evidence with the free-text thesis note', () => {
    const request = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, defaultThesis),
      { ...defaultThesis, note: 'Use durable cash flow as my main lens.' },
    )

    expect(request.thesis.note).toBe('Use durable cash flow as my main lens.')
    expect(request.evidence.length).toBeLessThanOrEqual(14)
    expect(request.evidence).toContainEqual(
      expect.objectContaining({
        id: 'metric:earningsGrowth',
        text: expect.stringContaining('Source: Finnhub'),
      }),
    )
    expect(request.evidence).toContainEqual(
      expect.objectContaining({ id: 'metric:peRatio' }),
    )
    expect(
      request.evidence.some(
        (item) =>
          item.id.startsWith('fit:') &&
          /supports your thesis|weakens the thesis fit|is mixed/.test(
            item.text,
          ),
      ),
    ).toBe(true)
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

    vi.mocked(Date.now).mockReturnValue(
      1_000_000 + 6 * 60 * 60 * 1000 + 1,
    )
    const refreshed = await requestResearchIntelligence(request)
    expect(refreshed.source).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent requests for the same stock and thesis', async () => {
    let resolveResponse: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const request = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, defaultThesis),
      defaultThesis,
    )

    const first = requestResearchIntelligence(request)
    const second = requestResearchIntelligence(request)
    resolveResponse(new Response(JSON.stringify(response)))

    const results = await Promise.all([first, second])
    expect(results).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(results[1].opinion).toBe('Mixed')
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

  })

  it('discards score-bearing v1 cache entries', async () => {
    window.localStorage.setItem(
      'knowyourstocks.researchIntelligence.v1.IBM.legacy',
      JSON.stringify({ response: { score: 91 } }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
    )
    const request = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, defaultThesis),
      defaultThesis,
    )

    await requestResearchIntelligence(request)

    expect(
      window.localStorage.getItem(
        'knowyourstocks.researchIntelligence.v1.IBM.legacy',
      ),
    ).toBeNull()
    expect(researchIntelligenceCacheKey(request)).toContain(
      'researchIntelligence.v2',
    )
  })

  it('parses safe API errors and rejects extra response fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: 'Limit reached.',
              code: 'INTELLIGENCE_LIMIT_REACHED',
              retryable: true,
            }),
            { status: 429 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ...response, score: 88 })),
        ),
    )
    const first = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, defaultThesis),
      defaultThesis,
    )
    const second = createResearchIntelligenceRequest(
      security,
      scoreSecurity(security, { ...defaultThesis, style: 'value' }),
      { ...defaultThesis, style: 'value' },
    )

    await expect(requestResearchIntelligence(first)).rejects.toMatchObject({
      code: 'INTELLIGENCE_LIMIT_REACHED',
      retryable: true,
    })
    await expect(requestResearchIntelligence(second)).rejects.toThrow()
  })
})
