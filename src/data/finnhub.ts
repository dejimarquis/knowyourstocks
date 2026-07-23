import { z } from 'zod'
import type { SecuritySnapshot } from './alphaVantage'

const apiUrl = 'https://finnhub.io/api/v1'

const quoteSchema = z.object({
  c: z.number(),
  dp: z.number().nullable().optional(),
  pc: z.number().nullable().optional(),
  t: z.number(),
})

const profileSchema = z.object({
  exchange: z.string().optional(),
  finnhubIndustry: z.string().optional(),
  marketCapitalization: z.number().nullable().optional(),
  name: z.string().optional(),
  ticker: z.string().optional(),
})

const metricsSchema = z.object({
  metric: z
    .object({
      beta: z.number().nullable().optional(),
      epsTTM: z.number().nullable().optional(),
      marketCapitalization: z.number().nullable().optional(),
      netProfitMarginTTM: z.number().nullable().optional(),
      peBasicExclExtraTTM: z.number().nullable().optional(),
      pbAnnual: z.number().nullable().optional(),
      dividendYieldIndicatedAnnual: z.number().nullable().optional(),
      revenueGrowthTTMYoy: z.number().nullable().optional(),
      roeTTM: z.number().nullable().optional(),
      '52WeekHigh': z.number().nullable().optional(),
      '52WeekLow': z.number().nullable().optional(),
    })
    .passthrough(),
})

const searchSchema = z.object({
  result: z
    .array(
      z.object({
        description: z.string(),
        displaySymbol: z.string(),
        symbol: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
})

const request = async (
  path: string,
  parameters: Record<string, string>,
): Promise<unknown> => {
  const url = new URL(`${apiUrl}/${path}`)

  Object.entries(parameters).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Finnhub returned HTTP ${response.status}.`)
  }

  const value = (await response.json()) as { error?: string }

  if (value.error) {
    throw new Error(value.error)
  }

  return value
}

const resolveSymbol = async (value: string, token: string): Promise<string> => {
  const query = value.trim()

  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(query)) {
    return query
  }

  if (query.length < 2) {
    throw new Error('Enter a company name or US ticker symbol.')
  }

  const search = searchSchema.parse(
    await request('search', { q: query, token }),
  )
  const match = search.result?.find(
    (candidate) =>
      candidate.type === 'Common Stock' &&
      !candidate.symbol.includes(':') &&
      !candidate.symbol.includes('.'),
  )

  if (!match) {
    throw new Error(`No supported US stock matched "${query}".`)
  }

  return match.symbol
}

const percentToDecimal = (value: number | null | undefined) =>
  value == null ? null : value / 100

export const fetchFinnhubSecurity = async (
  query: string,
  token: string,
): Promise<SecuritySnapshot> => {
  const key = token.trim()

  if (!key) {
    throw new Error('Enter a Finnhub API key.')
  }

  const symbol = await resolveSymbol(query, key)
  const [quoteValue, profileValue, metricsValue] = await Promise.all([
    request('quote', { symbol, token: key }),
    request('stock/profile2', { symbol, token: key }),
    request('stock/metric', { symbol, metric: 'all', token: key }),
  ])
  const quote = quoteSchema.parse(quoteValue)
  const profile = profileSchema.parse(profileValue)
  const metrics = metricsSchema.parse(metricsValue).metric

  if (!quote.c || !quote.t) {
    throw new Error(`Finnhub did not return current quote data for ${symbol}.`)
  }

  return {
    symbol,
    name: profile.name || profile.ticker || symbol,
    exchange: profile.exchange ?? null,
    sector: profile.finnhubIndustry ?? null,
    industry: profile.finnhubIndustry ?? null,
    price: quote.c,
    previousClose: quote.pc ?? null,
    changePercent: quote.dp ?? null,
    latestTradingDay: new Date(quote.t * 1000).toISOString().slice(0, 10),
    marketCap:
      metrics.marketCapitalization != null
        ? metrics.marketCapitalization * 1_000_000
        : profile.marketCapitalization != null
          ? profile.marketCapitalization * 1_000_000
          : null,
    peRatio: metrics.peBasicExclExtraTTM ?? null,
    priceToBook: metrics.pbAnnual ?? null,
    dividendYield: percentToDecimal(metrics.dividendYieldIndicatedAnnual),
    eps: metrics.epsTTM ?? null,
    profitMargin: percentToDecimal(metrics.netProfitMarginTTM),
    returnOnEquity: percentToDecimal(metrics.roeTTM),
    revenueGrowth: percentToDecimal(metrics.revenueGrowthTTMYoy),
    earningsGrowth: null,
    beta: metrics.beta ?? null,
    week52High: metrics['52WeekHigh'] ?? null,
    week52Low: metrics['52WeekLow'] ?? null,
    source: 'Finnhub',
  }
}
