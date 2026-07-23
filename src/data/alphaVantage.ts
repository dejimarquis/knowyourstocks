import { z } from 'zod'

const quoteResponseSchema = z
  .object({
    'Global Quote': z.record(z.string(), z.string()).optional(),
    Note: z.string().optional(),
    Information: z.string().optional(),
    'Error Message': z.string().optional(),
  })
  .passthrough()

const overviewResponseSchema = z
  .object({
    Symbol: z.string().optional(),
    Name: z.string().optional(),
    Exchange: z.string().optional(),
    Sector: z.string().optional(),
    Industry: z.string().optional(),
    MarketCapitalization: z.string().optional(),
    PERatio: z.string().optional(),
    TrailingPE: z.string().optional(),
    PriceToBookRatio: z.string().optional(),
    DividendYield: z.string().optional(),
    EPS: z.string().optional(),
    ProfitMargin: z.string().optional(),
    ReturnOnEquityTTM: z.string().optional(),
    QuarterlyRevenueGrowthYOY: z.string().optional(),
    QuarterlyEarningsGrowthYOY: z.string().optional(),
    Beta: z.string().optional(),
    '52WeekHigh': z.string().optional(),
    '52WeekLow': z.string().optional(),
    Note: z.string().optional(),
    Information: z.string().optional(),
    'Error Message': z.string().optional(),
  })
  .passthrough()

const searchResponseSchema = z
  .object({
    bestMatches: z
      .array(
        z.object({
          '1. symbol': z.string(),
          '2. name': z.string(),
          '3. type': z.string(),
          '4. region': z.string(),
        }),
      )
      .optional(),
    Note: z.string().optional(),
    Information: z.string().optional(),
    'Error Message': z.string().optional(),
  })
  .passthrough()

export type SecuritySnapshot = {
  symbol: string
  name: string
  exchange: string | null
  sector: string | null
  industry: string | null
  price: number
  previousClose: number | null
  changePercent: number | null
  latestTradingDay: string
  marketCap: number | null
  peRatio: number | null
  priceToBook: number | null
  dividendYield: number | null
  eps: number | null
  profitMargin: number | null
  returnOnEquity: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  beta: number | null
  week52High: number | null
  week52Low: number | null
  source: 'Alpha Vantage'
}

const apiUrl = 'https://www.alphavantage.co/query'

const parseNumber = (value: string | undefined): number | null => {
  if (!value || value === '-' || value === 'None') {
    return null
  }

  const parsed = Number(value.replace('%', ''))
  return Number.isFinite(parsed) ? parsed : null
}

const providerMessage = (value: {
  Note?: string
  Information?: string
  'Error Message'?: string
}): string | null =>
  value['Error Message'] ?? value.Note ?? value.Information ?? null

const request = async (parameters: Record<string, string>): Promise<unknown> => {
  const url = new URL(apiUrl)

  Object.entries(parameters).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Alpha Vantage returned HTTP ${response.status}.`)
  }

  return response.json()
}

export const normalizeSymbol = (value: string): string => {
  const symbol = value.trim().toUpperCase()

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
    throw new Error('Enter a valid US ticker symbol.')
  }

  return symbol
}

const resolveSymbol = async (value: string, apiKey: string): Promise<string> => {
  const trimmedValue = value.trim()

  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(trimmedValue)) {
    return trimmedValue
  }

  if (trimmedValue.length < 2) {
    throw new Error('Enter a company name or US ticker symbol.')
  }

  const searchResponse = searchResponseSchema.parse(
    await request({
      function: 'SYMBOL_SEARCH',
      keywords: trimmedValue,
      apikey: apiKey,
    }),
  )
  const message = providerMessage(searchResponse)

  if (message) {
    throw new Error(message)
  }

  const match = searchResponse.bestMatches?.find(
    (candidate) =>
      candidate['4. region'] === 'United States' &&
      candidate['3. type'] === 'Equity',
  )

  if (!match) {
    throw new Error(`No supported US stock matched "${trimmedValue}".`)
  }

  return normalizeSymbol(match['1. symbol'])
}

export const fetchAlphaVantageSecurity = async (
  requestedSymbol: string,
  apiKey: string,
): Promise<SecuritySnapshot> => {
  const key = apiKey.trim()

  if (!key) {
    throw new Error('Enter an Alpha Vantage API key.')
  }

  const symbol = await resolveSymbol(requestedSymbol, key)

  const [quoteValue, overviewValue] = await Promise.all([
    request({ function: 'GLOBAL_QUOTE', symbol, apikey: key }),
    request({ function: 'OVERVIEW', symbol, apikey: key }),
  ])

  const quoteResponse = quoteResponseSchema.parse(quoteValue)
  const overviewResponse = overviewResponseSchema.parse(overviewValue)
  const message =
    providerMessage(quoteResponse) ?? providerMessage(overviewResponse)

  if (message) {
    throw new Error(message)
  }

  const quote = quoteResponse['Global Quote']
  const price = parseNumber(quote?.['05. price'])
  const latestTradingDay = quote?.['07. latest trading day']

  if (!quote || price === null || !latestTradingDay) {
    throw new Error(
      `Alpha Vantage did not return current end-of-day data for ${symbol}.`,
    )
  }

  return {
    symbol,
    name: overviewResponse.Name || symbol,
    exchange: overviewResponse.Exchange ?? null,
    sector: overviewResponse.Sector ?? null,
    industry: overviewResponse.Industry ?? null,
    price,
    previousClose: parseNumber(quote['08. previous close']),
    changePercent: parseNumber(quote['10. change percent']),
    latestTradingDay,
    marketCap: parseNumber(overviewResponse.MarketCapitalization),
    peRatio: parseNumber(
      overviewResponse.TrailingPE ?? overviewResponse.PERatio,
    ),
    priceToBook: parseNumber(overviewResponse.PriceToBookRatio),
    dividendYield: parseNumber(overviewResponse.DividendYield),
    eps: parseNumber(overviewResponse.EPS),
    profitMargin: parseNumber(overviewResponse.ProfitMargin),
    returnOnEquity: parseNumber(overviewResponse.ReturnOnEquityTTM),
    revenueGrowth: parseNumber(overviewResponse.QuarterlyRevenueGrowthYOY),
    earningsGrowth: parseNumber(overviewResponse.QuarterlyEarningsGrowthYOY),
    beta: parseNumber(overviewResponse.Beta),
    week52High: parseNumber(overviewResponse['52WeekHigh']),
    week52Low: parseNumber(overviewResponse['52WeekLow']),
    source: 'Alpha Vantage',
  }
}
