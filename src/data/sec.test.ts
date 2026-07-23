import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from './alphaVantage'
import { enrichWithSecFallback } from './sec'

const incompleteSecurity: SecuritySnapshot = {
  symbol: 'CBRS',
  name: 'Cerebras Systems Inc.',
  exchange: 'NASDAQ NMS - GLOBAL MARKET',
  sector: 'Semiconductors',
  industry: 'Semiconductors',
  price: 220,
  previousClose: 209.81,
  changePercent: 4.86,
  latestTradingDay: '2026-07-23',
  marketCap: 58_200_000_000,
  peRatio: null,
  priceToBook: null,
  dividendYield: null,
  eps: null,
  profitMargin: null,
  returnOnEquity: null,
  revenueGrowth: null,
  earningsGrowth: null,
  beta: null,
  week52High: null,
  week52Low: null,
  source: 'Finnhub',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enrichWithSecFallback', () => {
  it('fills missing CBRS fundamentals while preserving a non-meaningful P/E', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            symbol: 'CBRS',
            cik: '0002021728',
            companyName: 'Cerebras Systems Inc.',
            filingDate: '2026-06-24',
            revenue: 193_406_000,
            revenueGrowth: 0.9435,
            netIncome: -14_006_000,
            profitMargin: -0.0724,
            epsAnnualized: -0.88,
            earningsGrowth: null,
            stockholdersEquity: -194_682_000,
            returnOnEquity: null,
            source: 'SEC EDGAR',
          }),
          { status: 200 },
        ),
      ),
    )

    const enriched = await enrichWithSecFallback(incompleteSecurity)

    expect(enriched.profitMargin).toBe(-0.0724)
    expect(enriched.revenueGrowth).toBe(0.9435)
    expect(enriched.eps).toBe(-0.88)
    expect(enriched.peRatio).toBeNull()
    expect(enriched.source).toBe('Finnhub + SEC EDGAR')
  })
})
