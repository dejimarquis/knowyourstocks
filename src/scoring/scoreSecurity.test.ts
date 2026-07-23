import { describe, expect, it } from 'vitest'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { defaultThesis } from '../domain/thesis'
import { scoreSecurity } from './scoreSecurity'

const ibm: SecuritySnapshot = {
  symbol: 'IBM',
  name: 'International Business Machines',
  exchange: 'NYSE',
  sector: 'TECHNOLOGY',
  industry: 'INFORMATION TECHNOLOGY SERVICES',
  price: 206.5,
  previousClose: 205.77,
  changePercent: 0.3548,
  latestTradingDay: '2026-07-23',
  marketCap: 193400209000,
  peRatio: 18.21,
  priceToBook: 6,
  dividendYield: 0.0319,
  eps: 11.3,
  profitMargin: 0.156,
  returnOnEquity: 0.358,
  revenueGrowth: 0.095,
  earningsGrowth: 0.142,
  beta: 0.675,
  week52High: 332.46,
  week52Low: 204.44,
  source: 'Alpha Vantage',
}

describe('scoreSecurity', () => {
  it('produces an inspectable educational fit score', () => {
    const result = scoreSecurity(ibm, defaultThesis)

    expect(result.total).not.toBeNull()
    expect(result.factors).toHaveLength(7)
    expect(result.factors.find((factor) => factor.key === 'sector')?.earned).toBe(
      20,
    )
  })

  it('refuses to score when too much evidence is missing', () => {
    const incomplete = Object.fromEntries(
      Object.entries(ibm).map(([key, value]) => [
        key,
        typeof value === 'number' ? null : value,
      ]),
    ) as unknown as SecuritySnapshot

    const result = scoreSecurity(incomplete, defaultThesis)

    expect(result.total).toBeNull()
    expect(result.label).toBe('Insufficient data')
  })

  it('scores a newly listed loss-making company when SEC growth data is available', () => {
    const cbrs: SecuritySnapshot = {
      ...ibm,
      symbol: 'CBRS',
      name: 'Cerebras Systems Inc.',
      sector: 'Semiconductors',
      industry: 'Semiconductors',
      price: 220,
      marketCap: 58_200_000_000,
      peRatio: null,
      eps: -0.88,
      profitMargin: -0.0724,
      returnOnEquity: null,
      revenueGrowth: 0.9435,
      earningsGrowth: null,
      beta: null,
      source: 'Finnhub + SEC EDGAR',
    }

    const result = scoreSecurity(cbrs, defaultThesis)

    expect(result.total).not.toBeNull()
    expect(result.label).not.toBe('Insufficient data')
  })
})
