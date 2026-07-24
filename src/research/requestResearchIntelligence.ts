import { z } from 'zod'
import type { SecuritySnapshot } from '../data/alphaVantage'
import type { InvestmentThesis } from '../domain/thesis'
import type { FitScore } from '../scoring/scoreSecurity'

const cachePrefix = 'knowyourstocks.researchIntelligence.v1'
const clientStorageKey = 'knowyourstocks.intelligenceClient'
const cacheLifetimeMs = 6 * 60 * 60 * 1000

const evidenceSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  text: z.string(),
})

const responseSchema = z.object({
  score: z.number().int().min(0).max(100),
  opinion: z.enum([
    'Compelling',
    'Promising but mixed',
    'Watch closely',
    'Reconsider',
  ]),
  summary: z.string().min(1),
  strengths: z.array(
    z.object({ evidenceId: z.string(), text: z.string().min(1) }),
  ),
  risks: z.array(
    z.object({ evidenceId: z.string(), text: z.string().min(1) }),
  ),
  confidence: z.enum(['low', 'medium', 'high']),
})

const cachedResponseSchema = z.object({
  fingerprint: z.string(),
  fetchedAt: z.number(),
  response: responseSchema,
})

export type ResearchIntelligenceResponse = z.infer<typeof responseSchema>
export type ResearchIntelligenceResult = ResearchIntelligenceResponse & {
  fetchedAt: number
  source: 'network' | 'cache'
}

export type ResearchIntelligenceRequest = {
  version: 1
  symbol: string
  company: {
    name: string
    sector?: string | null
    industry?: string | null
    snapshot: {
      earningsGrowth?: number | null
      operatingMargin?: number | null
      freeCashFlow?: number | null
      debtToEquity?: number | null
      currentRatio?: number | null
      metricProvenance: SecuritySnapshot['metricProvenance']
    }
  }
  thesis: {
    sectors: string[]
    horizon: string
    risk: string
    style: string
  }
  deterministicFit: {
    total: number | null
    label: string
  }
  evidence: z.infer<typeof evidenceSchema>[]
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)

const formatPercent = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)

const metricDefinitions: Array<{
  key: keyof SecuritySnapshot
  label: string
  format: (value: number) => string
}> = [
  { key: 'marketCap', label: 'Market capitalization', format: formatCurrency },
  { key: 'peRatio', label: 'Trailing price-to-earnings ratio', format: formatNumber },
  { key: 'priceToBook', label: 'Price-to-book ratio', format: formatNumber },
  { key: 'dividendYield', label: 'Dividend yield', format: formatPercent },
  { key: 'eps', label: 'Trailing earnings per share', format: formatCurrency },
  { key: 'profitMargin', label: 'Profit margin', format: formatPercent },
  { key: 'returnOnEquity', label: 'Return on equity', format: formatPercent },
  { key: 'revenueGrowth', label: 'Revenue growth', format: formatPercent },
  { key: 'earningsGrowth', label: 'Earnings growth', format: formatPercent },
  { key: 'operatingMargin', label: 'Operating margin', format: formatPercent },
  { key: 'freeCashFlow', label: 'Free cash flow', format: formatCurrency },
  { key: 'debtToEquity', label: 'Debt-to-equity ratio', format: formatNumber },
  { key: 'currentRatio', label: 'Current ratio', format: formatNumber },
  { key: 'beta', label: 'Beta', format: formatNumber },
  { key: 'week52High', label: '52-week high', format: formatCurrency },
  { key: 'week52Low', label: '52-week low', format: formatCurrency },
]

const provenanceText = (
  security: SecuritySnapshot,
  key: keyof SecuritySnapshot,
) => {
  const provenance = security.metricProvenance?.[key]
  if (!provenance) {
    return `Normalized from ${security.source}; detailed metric provenance is unavailable.`
  }

  return `Source: ${provenance.source}; as of ${provenance.asOf ?? 'date unavailable'}; period: ${provenance.period}.`
}

export const createResearchIntelligenceRequest = (
  security: SecuritySnapshot,
  fit: FitScore,
  thesis: InvestmentThesis,
): ResearchIntelligenceRequest => {
  const metricEvidence = metricDefinitions.flatMap(({ key, label, format }) => {
    const value = security[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return []
    }

    return [
      {
        id: `metric:${String(key)}`,
        symbol: security.symbol,
        text: `${label}: ${format(value)}. ${provenanceText(security, key)}`,
      },
    ]
  })
  const fitEvidence = fit.factors.map((factor) => ({
    id: `fit:${factor.key}`,
    symbol: security.symbol,
    text: `Deterministic Fit factor "${factor.label}" ${
      factor.available
        ? `earned ${formatNumber(factor.earned)} of ${formatNumber(factor.maximum)}`
        : 'was unavailable'
    }. ${factor.evidence}`,
  }))

  return {
    version: 1,
    symbol: security.symbol,
    company: {
      name: security.name,
      sector: security.sector,
      industry: security.industry,
      snapshot: {
        earningsGrowth: security.earningsGrowth,
        operatingMargin: security.operatingMargin,
        freeCashFlow: security.freeCashFlow,
        debtToEquity: security.debtToEquity,
        currentRatio: security.currentRatio,
        metricProvenance: security.metricProvenance ?? {},
      },
    },
    thesis: {
      sectors: thesis.sectors,
      horizon: thesis.horizon,
      risk: thesis.risk,
      style: thesis.style,
    },
    deterministicFit: {
      total: fit.total,
      label: fit.label,
    },
    evidence: [...metricEvidence, ...fitEvidence].slice(0, 24),
  }
}

const fingerprintFor = (request: ResearchIntelligenceRequest) =>
  JSON.stringify({
    symbol: request.symbol,
    thesis: request.thesis,
    evidence: request.evidence,
  })

const hash = (value: string) => {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

export const researchIntelligenceCacheKey = (
  request: ResearchIntelligenceRequest,
) => {
  const fingerprint = fingerprintFor(request)
  return `${cachePrefix}.${request.symbol}.${hash(fingerprint)}`
}

const readCache = (
  request: ResearchIntelligenceRequest,
): ResearchIntelligenceResult | null => {
  const key = researchIntelligenceCacheKey(request)
  const fingerprint = fingerprintFor(request)

  try {
    const value = window.localStorage.getItem(key)
    if (!value) {
      return null
    }

    const cached = cachedResponseSchema.parse(JSON.parse(value))
    if (
      cached.fingerprint !== fingerprint ||
      Date.now() - cached.fetchedAt > cacheLifetimeMs
    ) {
      window.localStorage.removeItem(key)
      return null
    }

    return { ...cached.response, fetchedAt: cached.fetchedAt, source: 'cache' }
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

const writeCache = (
  request: ResearchIntelligenceRequest,
  response: ResearchIntelligenceResponse,
  fetchedAt: number,
) => {
  try {
    window.localStorage.setItem(
      researchIntelligenceCacheKey(request),
      JSON.stringify({
        fingerprint: fingerprintFor(request),
        fetchedAt,
        response,
      }),
    )
  } catch {
    // A storage failure should not hide an otherwise valid assessment.
  }
}

const getClientId = () => {
  const existing = window.localStorage.getItem(clientStorageKey)
  if (existing) {
    return existing
  }

  const value = crypto.randomUUID()
  window.localStorage.setItem(clientStorageKey, value)
  return value
}

export const requestResearchIntelligence = async (
  request: ResearchIntelligenceRequest,
  signal?: AbortSignal,
): Promise<ResearchIntelligenceResult> => {
  const cached = readCache(request)
  if (cached) {
    return cached
  }

  const response = await fetch('/api/research-intelligence', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-intelligence-client': getClientId(),
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Research intelligence returned HTTP ${response.status}.`)
  }

  const intelligence = responseSchema.parse(await response.json())
  const fetchedAt = Date.now()
  writeCache(request, intelligence, fetchedAt)
  return { ...intelligence, fetchedAt, source: 'network' }
}
