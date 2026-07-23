import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAlphaVantageSecurity } from './alphaVantage'

const quoteResponse = {
  'Global Quote': {
    '01. symbol': 'IBM',
    '05. price': '206.5000',
    '07. latest trading day': '2026-07-23',
    '08. previous close': '205.7700',
    '10. change percent': '0.3548%',
  },
}

const overviewResponse = {
  Symbol: 'IBM',
  Name: 'International Business Machines',
  Exchange: 'NYSE',
  Sector: 'TECHNOLOGY',
  Industry: 'INFORMATION TECHNOLOGY SERVICES',
  MarketCapitalization: '193400209000',
  TrailingPE: '18.21',
  DividendYield: '0.0319',
  EPS: '11.3',
  ProfitMargin: '0.156',
  ReturnOnEquityTTM: '0.358',
  QuarterlyRevenueGrowthYOY: '0.095',
  QuarterlyEarningsGrowthYOY: '0.142',
  Beta: '0.675',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchAlphaVantageSecurity', () => {
  it('normalizes actual provider responses into a typed snapshot', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(quoteResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(overviewResponse), { status: 200 }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const security = await fetchAlphaVantageSecurity('IBM', 'personal-key')

    expect(security.symbol).toBe('IBM')
    expect(security.price).toBe(206.5)
    expect(security.marketCap).toBe(193400209000)
    expect(security.source).toBe('Alpha Vantage')
  })

  it('surfaces provider rate-limit messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Note: 'Rate limit reached.' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(overviewResponse), { status: 200 }),
      )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchAlphaVantageSecurity('IBM', 'personal-key'),
    ).rejects.toThrow('Rate limit reached.')
  })

  it('resolves a company name before fetching its data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bestMatches: [
              {
                '1. symbol': 'IBM',
                '2. name': 'International Business Machines',
                '3. type': 'Equity',
                '4. region': 'United States',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(quoteResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(overviewResponse), { status: 200 }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const security = await fetchAlphaVantageSecurity(
      'International Business Machines',
      'personal-key',
    )

    expect(security.symbol).toBe('IBM')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
