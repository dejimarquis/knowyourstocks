const tickerIndexUrl = 'https://www.sec.gov/files/company_tickers.json'
const companyFactsUrl = 'https://data.sec.gov/api/xbrl/companyfacts'
const cacheLifetimeMs = 60 * 60 * 1000
const tickerCacheLifetimeMs = 24 * 60 * 60 * 1000

type TickerRecord = {
  cik_str: number
  ticker: string
  title: string
}

type SecFact = {
  start?: string
  end: string
  val: number
  form: string
  filed: string
  frame?: string
}

type CompanyFacts = {
  entityName: string
  facts: {
    'us-gaap'?: Record<
      string,
      {
        units?: Record<string, SecFact[]>
      }
    >
  }
}

export type SecFundamentals = {
  symbol: string
  cik: string
  companyName: string
  filingDate: string | null
  revenue: number | null
  revenueGrowth: number | null
  netIncome: number | null
  profitMargin: number | null
  epsAnnualized: number | null
  earningsGrowth: number | null
  stockholdersEquity: number | null
  returnOnEquity: number | null
  source: 'SEC EDGAR'
}

let tickerCache:
  | {
      expiresAt: number
      records: Map<string, TickerRecord>
    }
  | undefined

const companyFactsCache = new Map<
  string,
  { expiresAt: number; value: CompanyFacts }
>()

const fetchJson = async <T>(url: string): Promise<T> => {
  const userAgent =
    process.env.SEC_USER_AGENT ?? 'KnowYourStocks contact@knowyourstocks.app'
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`SEC returned HTTP ${response.status} for ${url}.`)
  }

  return (await response.json()) as T
}

const getTickerRecords = async (): Promise<Map<string, TickerRecord>> => {
  if (tickerCache && tickerCache.expiresAt > Date.now()) {
    return tickerCache.records
  }

  const response = await fetchJson<Record<string, TickerRecord>>(tickerIndexUrl)
  const records = new Map(
    Object.values(response).map((record) => [record.ticker.toUpperCase(), record]),
  )
  tickerCache = {
    expiresAt: Date.now() + tickerCacheLifetimeMs,
    records,
  }
  return records
}

const getCompanyFacts = async (cik: string): Promise<CompanyFacts> => {
  const cached = companyFactsCache.get(cik)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = await fetchJson<CompanyFacts>(
    `${companyFactsUrl}/CIK${cik}.json`,
  )
  companyFactsCache.set(cik, {
    expiresAt: Date.now() + cacheLifetimeMs,
    value,
  })
  return value
}

const getUnitFacts = (
  companyFacts: CompanyFacts,
  conceptNames: string[],
  unit: string,
): SecFact[] => {
  for (const conceptName of conceptNames) {
    const facts = companyFacts.facts['us-gaap']?.[conceptName]?.units?.[unit]

    if (facts?.length) {
      return facts
    }
  }

  return []
}

const supportedForms = new Set(['10-Q', '10-K', '20-F', '40-F'])

const sortFacts = (facts: SecFact[]) =>
  [...facts].sort(
    (left, right) =>
      left.end.localeCompare(right.end) ||
      left.filed.localeCompare(right.filed),
  )

const latestFramedFact = (facts: SecFact[]) => {
  const framedFacts = sortFacts(
    facts.filter(
      (fact) =>
        supportedForms.has(fact.form) &&
        typeof fact.frame === 'string' &&
        typeof fact.start === 'string',
    ),
  )
  return framedFacts.at(-1) ?? null
}

const priorComparableFact = (facts: SecFact[], latest: SecFact | null) => {
  if (!latest?.frame) {
    return null
  }

  const match = /^CY(\d{4})(Q[1-4])?$/.exec(latest.frame)

  if (!match) {
    return null
  }

  const priorFrame = `CY${Number(match[1]) - 1}${match[2] ?? ''}`
  return (
    sortFacts(
      facts.filter(
        (fact) =>
          supportedForms.has(fact.form) && fact.frame === priorFrame,
      ),
    ).at(-1) ?? null
  )
}

const latestInstantFact = (facts: SecFact[]) =>
  sortFacts(
    facts.filter(
      (fact) => supportedForms.has(fact.form) && !fact.start && fact.end,
    ),
  ).at(-1) ?? null

const growthRate = (current: number | null, prior: number | null) => {
  if (current == null || prior == null || prior === 0) {
    return null
  }

  return (current - prior) / Math.abs(prior)
}

const durationDays = (fact: SecFact | null) => {
  if (!fact?.start) {
    return null
  }

  return (
    (Date.parse(fact.end) - Date.parse(fact.start)) / (24 * 60 * 60 * 1000)
  )
}

const annualize = (value: number | null, fact: SecFact | null) => {
  const days = durationDays(fact)

  if (value == null || days == null || days <= 0) {
    return value
  }

  if (days <= 100) {
    return value * 4
  }

  if (days <= 200) {
    return value * 2
  }

  return value
}

export const deriveSecFundamentals = (
  symbol: string,
  cik: string,
  companyFacts: CompanyFacts,
): SecFundamentals => {
  const revenueFacts = getUnitFacts(
    companyFacts,
    [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
    ],
    'USD',
  )
  const netIncomeFacts = getUnitFacts(
    companyFacts,
    ['NetIncomeLoss', 'ProfitLoss'],
    'USD',
  )
  const epsFacts = getUnitFacts(
    companyFacts,
    ['EarningsPerShareDiluted', 'EarningsPerShareBasic'],
    'USD/shares',
  )
  const equityFacts = getUnitFacts(
    companyFacts,
    ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
    'USD',
  )

  const revenueFact = latestFramedFact(revenueFacts)
  const priorRevenueFact = priorComparableFact(revenueFacts, revenueFact)
  const netIncomeFact = latestFramedFact(netIncomeFacts)
  const priorNetIncomeFact = priorComparableFact(netIncomeFacts, netIncomeFact)
  const epsFact = latestFramedFact(epsFacts)
  const equityFact = latestInstantFact(equityFacts)

  const revenue = revenueFact?.val ?? null
  const netIncome = netIncomeFact?.val ?? null
  const equity = equityFact?.val ?? null
  const profitMargin =
    revenue != null && netIncome != null && revenue !== 0
      ? netIncome / revenue
      : null
  const annualizedIncome = annualize(netIncome, netIncomeFact)
  const returnOnEquity =
    annualizedIncome != null && equity != null && equity > 0
      ? annualizedIncome / equity
      : null
  const earningsGrowth =
    netIncome != null &&
    priorNetIncomeFact?.val != null &&
    netIncome > 0 &&
    priorNetIncomeFact.val > 0
      ? growthRate(netIncome, priorNetIncomeFact.val)
      : null
  const filingDates = [
    revenueFact?.filed,
    netIncomeFact?.filed,
    epsFact?.filed,
    equityFact?.filed,
  ].filter((value): value is string => Boolean(value))

  return {
    symbol,
    cik,
    companyName: companyFacts.entityName,
    filingDate: filingDates.sort().at(-1) ?? null,
    revenue,
    revenueGrowth: growthRate(revenue, priorRevenueFact?.val ?? null),
    netIncome,
    profitMargin,
    epsAnnualized: annualize(epsFact?.val ?? null, epsFact),
    earningsGrowth,
    stockholdersEquity: equity,
    returnOnEquity,
    source: 'SEC EDGAR',
  }
}

export const fetchSecFundamentals = async (
  requestedSymbol: string,
): Promise<SecFundamentals> => {
  const symbol = requestedSymbol.trim().toUpperCase()

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
    throw new Error('Invalid US ticker symbol.')
  }

  const tickerRecords = await getTickerRecords()
  const tickerRecord = tickerRecords.get(symbol)

  if (!tickerRecord) {
    throw new Error(`SEC does not have a company record for ${symbol}.`)
  }

  const cik = String(tickerRecord.cik_str).padStart(10, '0')
  const companyFacts = await getCompanyFacts(cik)
  return deriveSecFundamentals(symbol, cik, companyFacts)
}
