const tickerIndexUrl = 'https://www.sec.gov/files/company_tickers.json'
const companyFactsUrl = 'https://data.sec.gov/api/xbrl/companyfacts'
const cacheLifetimeMs = 60 * 60 * 1000
const tickerCacheLifetimeMs = 24 * 60 * 60 * 1000
const requestSpacingMs = 125
const maxCompanyFactsCacheEntries = 200

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
  conceptPriority?: number
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
const companyFactsRequests = new Map<string, Promise<CompanyFacts>>()
let nextSecRequestAt = 0
let secRequestQueue = Promise.resolve()

const waitForSecRequestSlot = () => {
  const slot = secRequestQueue.then(async () => {
    const delay = Math.max(0, nextSecRequestAt - Date.now())

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    nextSecRequestAt = Date.now() + requestSpacingMs
  })
  secRequestQueue = slot.catch(() => undefined)
  return slot
}

const retryDelay = (response: Response, attempt: number) => {
  const retryAfter = Number(response.headers.get('Retry-After'))
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : 1000 * 2 ** attempt
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const userAgent =
    process.env.SEC_USER_AGENT ?? 'KnowYourStocks contact@knowyourstocks.app'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForSecRequestSlot()
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    })

    if (response.ok) {
      return (await response.json()) as T
    }

    if (
      attempt < 2 &&
      (response.status === 403 ||
        response.status === 429 ||
        response.status >= 500)
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay(response, attempt)),
      )
      continue
    }

    throw new Error(`SEC returned HTTP ${response.status} for ${url}.`)
  }

  throw new Error(`SEC request failed for ${url}.`)
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

  const inFlight = companyFactsRequests.get(cik)

  if (inFlight) {
    return inFlight
  }

  const request = fetchJson<CompanyFacts>(
    `${companyFactsUrl}/CIK${cik}.json`,
  ).then((value) => {
    if (companyFactsCache.size >= maxCompanyFactsCacheEntries) {
      const oldestKey = companyFactsCache.keys().next().value

      if (oldestKey) {
        companyFactsCache.delete(oldestKey)
      }
    }
    companyFactsCache.set(cik, {
      expiresAt: Date.now() + cacheLifetimeMs,
      value,
    })
    return value
  })
  companyFactsRequests.set(cik, request)

  try {
    return await request
  } finally {
    companyFactsRequests.delete(cik)
  }
}

const getUnitFacts = (
  companyFacts: CompanyFacts,
  conceptNames: string[],
  unit: string,
): SecFact[] =>
  conceptNames.flatMap((conceptName, conceptPriority) =>
    (
      companyFacts.facts['us-gaap']?.[conceptName]?.units?.[unit] ?? []
    ).map((fact) => ({ ...fact, conceptPriority })),
  )

const supportedForms = new Set(['10-Q', '10-K', '20-F', '40-F'])

const sortFacts = (facts: SecFact[]) =>
  [...facts].sort(
    (left, right) =>
      left.end.localeCompare(right.end) ||
      left.filed.localeCompare(right.filed) ||
      (right.conceptPriority ?? 0) - (left.conceptPriority ?? 0),
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

const framedFact = (facts: SecFact[], frame: string | undefined) =>
  frame
    ? sortFacts(
        facts.filter(
          (fact) => supportedForms.has(fact.form) && fact.frame === frame,
        ),
      ).at(-1) ?? null
    : null

const latestInstantFactAtOrBefore = (facts: SecFact[], end: string | undefined) =>
  end
    ? sortFacts(
        facts.filter(
          (fact) =>
            supportedForms.has(fact.form) &&
            !fact.start &&
            fact.end <= end,
        ),
      ).at(-1) ?? null
    : latestInstantFact(facts)

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
  const netIncomeFact =
    framedFact(netIncomeFacts, revenueFact?.frame) ??
    latestFramedFact(netIncomeFacts)
  const priorNetIncomeFact = priorComparableFact(netIncomeFacts, netIncomeFact)
  const epsFact =
    framedFact(epsFacts, revenueFact?.frame) ?? latestFramedFact(epsFacts)
  const equityFact = latestInstantFactAtOrBefore(
    equityFacts,
    revenueFact?.end,
  )

  const revenue = revenueFact?.val ?? null
  const netIncome = netIncomeFact?.val ?? null
  const equity = equityFact?.val ?? null
  const profitMargin =
    revenue != null &&
    netIncome != null &&
    revenue !== 0 &&
    revenueFact?.frame === netIncomeFact?.frame
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
