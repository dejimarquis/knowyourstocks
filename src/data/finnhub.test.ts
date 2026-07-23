import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFinnhubSecurity } from './finnhub'

afterEach(() => {
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
                marketCapitalization: 193400.209,
                netProfitMarginTTM: 15.6,
                peBasicExclExtraTTM: 18.21,
                revenueGrowthTTMYoy: 9.5,
                roeTTM: 35.8,
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
