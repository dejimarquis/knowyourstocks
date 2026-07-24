import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFinnhubPeers,
  fetchFinnhubSecurity,
  resetFinnhubCacheForTests,
} from './finnhub'

afterEach(() => {
  resetFinnhubCacheForTests()
  vi.unstubAllGlobals()
})

describe('fetchFinnhubSecurity', () => {
  it('normalizes quote, profile, and financial metrics', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ c: 206.5, dp: 0.3548, pc: 205.77, t: 1784840400 }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              exchange: 'NYSE',
              finnhubIndustry: 'Technology',
              marketCapitalization: 193400.209,
              name: 'International Business Machines',
              ticker: 'IBM',
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              metric: {
                beta: 0.675,
                epsTTM: 11.3,
                epsGrowthTTMYoy: 14.2,
                freeCashFlowTTM: 12_500,
                marketCapitalization: 193400.209,
                netProfitMarginTTM: 15.6,
                operatingMarginTTM: 18.4,
                peBasicExclExtraTTM: 18.21,
                revenueGrowthTTMYoy: 9.5,
                roeTTM: 35.8,
                currentRatioQuarterly: 1.3,
                'totalDebt/totalEquityQuarterly': 245,
              },
            }),
            { status: 200 },
          ),
        ),
    )

    const security = await fetchFinnhubSecurity('IBM', 'personal-key')

    expect(security.source).toBe('Finnhub')
    expect(security.marketCap).toBe(193400209000)
    expect(security.profitMargin).toBe(0.156)
    expect(security.revenueGrowth).toBe(0.095)
    expect(security.earningsGrowth).toBeCloseTo(0.142)
    expect(security.operatingMargin).toBeCloseTo(0.184)
    expect(security.freeCashFlow).toBe(12_500_000_000)
    expect(security.debtToEquity).toBe(2.45)
    expect(security.currentRatio).toBe(1.3)
    expect(security.metricProvenance?.earningsGrowth?.source).toBe('Finnhub')
  })

  describe('fetchFinnhubPeers', () => {
    it('uses at most two seeds and reports partial peer failures', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(['MSFT', 'NVDA', 'MSFT']), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        fetchFinnhubPeers(['AAPL', 'GOOGL', 'AMZN'], 'personal-key'),
      ).rejects.toThrow('peer requests failed')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[0][0].toString()).toContain(
        'stock/peers?symbol=AAPL',
      )
    })
  })

  it('resolves a company name before loading data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [
              {
                description: 'APPLE INC',
                displaySymbol: 'AAPL',
                symbol: 'AAPL',
                type: 'Common Stock',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ c: 212, dp: 0.5, pc: 211, t: 1784840400 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'Apple Inc', ticker: 'AAPL' }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ metric: {} }), { status: 200 }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const security = await fetchFinnhubSecurity('Apple', 'personal-key')

    expect(security.symbol).toBe('AAPL')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
