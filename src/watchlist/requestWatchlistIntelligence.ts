import { z } from 'zod'
import type { SecuritySnapshot } from '../data/alphaVantage'
import type { InvestmentThesis } from '../domain/thesis'
import type {
  Watchlist,
  WatchlistBrief,
  WatchlistInsight,
  WatchlistItem,
  WatchlistPattern,
} from '../domain/watchlist'

const clientStorageKey = 'knowyourstocks.intelligenceClient'
const prohibitedAdvice =
  /\b(buy|sell|hold|short|purchase|exit|overweight|underweight|avoid|go\s+long|go\s+short|price\s+target|target\s+price|guarante(?:e|ed|es)|risk[-\s]?free|strong\s+buy|strong\s+sell)\b/i

const mappedEvidenceSchema = z.object({
  evidenceId: z.string(),
  text: z.string(),
})

const assessmentSchema = z.object({
  symbol: z.string(),
  score: z.number().int().min(0).max(100),
  opinion: z.enum([
    'Compelling',
    'Promising but mixed',
    'Watch closely',
    'Reconsider',
  ]),
  summary: z.string(),
  strengths: z.array(mappedEvidenceSchema).min(1).max(3),
  risks: z.array(mappedEvidenceSchema).min(1).max(3),
  confidence: z.enum(['low', 'medium', 'high']),
})

const patternSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  evidenceIds: z.array(z.string()).min(2),
  confidence: z.enum(['low', 'medium', 'high']),
  thesisRelationship: z.string(),
})

const responseSchema = z
  .object({
    prioritizedSignalIds: z.array(z.string()),
    prioritizedEvidenceIds: z.array(z.string()),
    summary: z.string(),
    assessments: z.array(assessmentSchema),
    experimentalPatterns: z.array(patternSchema),
    crossStockPatterns: z.array(patternSchema),
    uncertainties: z.array(z.string()),
  })
  .superRefine((response, context) => {
    const narratives = [
      response.summary,
      ...response.assessments.map((assessment) => assessment.summary),
      ...response.crossStockPatterns.flatMap((pattern) => [
        pattern.title,
        pattern.explanation,
        pattern.thesisRelationship,
      ]),
      ...response.uncertainties,
    ]
    if (narratives.some((narrative) => prohibitedAdvice.test(narrative))) {
      context.addIssue({
        code: 'custom',
        message: 'The model response included direct trade language.',
      })
    }
  })

type PacketEvidence = {
  id: string
  symbol: string
  text: string
}

class RateLimitError extends Error {}

const getClientId = () => {
  const existing = window.localStorage.getItem(clientStorageKey)

  if (existing) {
    return existing
  }

  const value = crypto.randomUUID()
  window.localStorage.setItem(clientStorageKey, value)
  return value
}

const compactText = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 500)

const metric = (
  label: string,
  current: number | null | undefined,
  previous: number | null | undefined,
  format: (value: number) => string,
) => {
  const currentText = current == null ? 'unavailable' : format(current)
  const previousText = previous == null ? 'unavailable' : format(previous)
  const delta =
    current == null || previous == null
      ? 'unavailable'
      : format(current - previous)
  return `${label}: current ${currentText}, previous ${previousText}, delta ${delta}`
}

const decimal = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5)))
const percent = (value: number) => `${decimal(value * 100)}%`
const currency = (value: number) => `$${decimal(value)}`

const snapshotEvidence = (
  item: WatchlistItem,
  key: 'growth-quality' | 'valuation-balance',
): PacketEvidence => {
  const current = item.currentSnapshot
  const previous = item.previousSnapshot
  const metrics =
    key === 'growth-quality'
      ? [
          metric('revenue growth', current.revenueGrowth, previous?.revenueGrowth, percent),
          metric('earnings growth', current.earningsGrowth, previous?.earningsGrowth, percent),
          metric('profit margin', current.profitMargin, previous?.profitMargin, percent),
          metric(
            'operating margin',
            current.operatingMargin,
            previous?.operatingMargin,
            percent,
          ),
          metric('return on equity', current.returnOnEquity, previous?.returnOnEquity, percent),
          metric('EPS', current.eps, previous?.eps, decimal),
        ]
      : [
          metric('free cash flow', current.freeCashFlow, previous?.freeCashFlow, currency),
          metric('market cap', current.marketCap, previous?.marketCap, currency),
          metric('P/E', current.peRatio, previous?.peRatio, decimal),
          metric('price/book', current.priceToBook, previous?.priceToBook, decimal),
          metric('debt/equity', current.debtToEquity, previous?.debtToEquity, decimal),
          metric('current ratio', current.currentRatio, previous?.currentRatio, decimal),
        ]

  return {
    id: `stock-evidence:${item.symbol.toLowerCase()}:${key}`,
    symbol: item.symbol,
    text: compactText(metrics.join('; ')),
  }
}

const fitEvidence = (item: WatchlistItem): PacketEvidence[] => {
  const previousFactors = new Map(
    item.previousFit?.factors.map((factor) => [factor.key, factor]) ?? [],
  )
  const currentFactors = new Map(
    item.currentFit.factors.map((factor) => [factor.key, factor]),
  )
  const keys = [...new Set([...currentFactors.keys(), ...previousFactors.keys()])]
  const total = metric(
    'thesis fit',
    item.currentFit.total,
    item.previousFit?.total,
    decimal,
  )

  return [
    {
      id: `stock-evidence:${item.symbol.toLowerCase()}:fit-total`,
      symbol: item.symbol,
      text: compactText(
        `${total}; current label ${item.currentFit.label}; previous label ${item.previousFit?.label ?? 'unavailable'}`,
      ),
    },
    ...keys.map((key) => {
      const current = currentFactors.get(key)
      const previous = previousFactors.get(key)
      return {
        id: `stock-evidence:${item.symbol.toLowerCase()}:fit-${key}`,
        symbol: item.symbol,
        text: compactText(
          `${current?.label ?? previous?.label ?? key}: current ${
            current
              ? `${decimal(current.earned)}/${decimal(current.maximum)}, ${current.available ? current.evidence : 'unavailable'}`
              : 'unavailable'
          }; previous ${
            previous
              ? `${decimal(previous.earned)}/${decimal(previous.maximum)}, ${previous.available ? previous.evidence : 'unavailable'}`
              : 'unavailable'
          }`,
        ),
      }
    }),
  ]
}

const concentrationEvidence = (
  watchlist: Watchlist,
  item: WatchlistItem,
): PacketEvidence => {
  const classification =
    item.currentSnapshot.sector ?? item.currentSnapshot.industry ?? 'Unclassified'
  const count = watchlist.items.filter(
    (candidate) =>
      (candidate.currentSnapshot.sector ??
        candidate.currentSnapshot.industry ??
        'Unclassified') === classification,
  ).length

  return {
    id: `stock-evidence:${item.symbol.toLowerCase()}:concentration`,
    symbol: item.symbol,
    text: `${classification} concentration: ${count} of ${watchlist.items.length} watched stocks (${percent(count / watchlist.items.length)}).`,
  }
}

const reviewContextEvidence = (
  item: WatchlistItem,
  brief: WatchlistBrief,
): PacketEvidence[] => {
  const stockSignals = brief.deterministicInsights.filter(
    (insight) => insight.symbol === item.symbol,
  )
  const deterministicText =
    stockSignals.length > 0
      ? `Verified deterministic signals: ${stockSignals
          .map((insight) => `${insight.id} (${insight.severity}): ${insight.title}`)
          .join('; ')}`
      : `Deterministic review found no stock-specific change signal for ${item.symbol}. Current and previous evidence is supplied without inferring a change.`

  return [
    {
      id: `stock-evidence:${item.symbol.toLowerCase()}:freshness`,
      symbol: item.symbol,
      text: compactText(
        `Latest market date ${item.currentSnapshot.latestTradingDay}; fundamentals as of ${item.currentSnapshot.fundamentalsAsOf ?? 'unavailable'}; reviewed ${item.lastReviewedAt}; refresh status ${item.reviewError ?? 'complete'}.`,
      ),
    },
    {
      id: `stock-evidence:${item.symbol.toLowerCase()}:earnings`,
      symbol: item.symbol,
      text: `Expected earnings date ${item.earningsDate ?? 'unavailable'}.`,
    },
    {
      id: `stock-evidence:${item.symbol.toLowerCase()}:signals`,
      symbol: item.symbol,
      text: compactText(deterministicText),
    },
    ...(item.sentiment
      ? [
          {
            id: `stock-evidence:${item.symbol.toLowerCase()}:sentiment`,
            symbol: item.symbol,
            text: compactText(
              `Headline sentiment current ${decimal(item.sentiment.score)} as of ${item.sentiment.asOf}; previous ${
                item.previousSentiment
                  ? `${decimal(item.previousSentiment.score)} as of ${item.previousSentiment.asOf}`
                  : 'unavailable'
              }. This is context, not business evidence.`,
            ),
          },
        ]
      : []),
  ]
}

const compactSnapshot = (snapshot: SecuritySnapshot) => ({
  earningsGrowth: snapshot.earningsGrowth,
  operatingMargin: snapshot.operatingMargin ?? null,
  freeCashFlow: snapshot.freeCashFlow ?? null,
  debtToEquity: snapshot.debtToEquity ?? null,
  currentRatio: snapshot.currentRatio ?? null,
  metricProvenance: snapshot.metricProvenance ?? {},
})

const stockEvidence = (
  watchlist: Watchlist,
  brief: WatchlistBrief,
  item: WatchlistItem,
): PacketEvidence[] => {
  const fit = fitEvidence(item)
  const context = [
    ...reviewContextEvidence(item, brief),
    concentrationEvidence(watchlist, item),
  ]
  const weakestFactors = item.currentFit.factors
    .filter((factor) => factor.available)
    .sort(
      (left, right) =>
        left.earned / left.maximum - right.earned / right.maximum,
    )
    .slice(0, 2)

  return [
    snapshotEvidence(item, 'growth-quality'),
    snapshotEvidence(item, 'valuation-balance'),
    {
      id: `stock-evidence:${item.symbol.toLowerCase()}:fit`,
      symbol: item.symbol,
      text: compactText(
        `${fit[0]?.text ?? 'Thesis fit unavailable.'} Weakest current factors: ${
          weakestFactors
            .map((factor) => `${factor.label}: ${factor.evidence}`)
            .join('; ') || 'unavailable'
        }.`,
      ),
    },
    {
      id: `stock-evidence:${item.symbol.toLowerCase()}:context`,
      symbol: item.symbol,
      text: compactText(context.map((evidence) => evidence.text).join(' ')),
    },
  ]
}

export const createWatchlistIntelligencePacket = (
  watchlist: Watchlist,
  brief: WatchlistBrief,
  thesis: InvestmentThesis,
) => ({
  version: 2 as const,
  thesis: {
    sectors: thesis.sectors,
    horizon: thesis.horizon,
    risk: thesis.risk,
    style: thesis.style,
    ...(thesis.note.trim() ? { note: thesis.note.trim() } : {}),
  },
  stocks: watchlist.items.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    sector: item.currentSnapshot.sector,
    industry: item.currentSnapshot.industry,
    currentSnapshot: compactSnapshot(item.currentSnapshot),
    previousSnapshot: item.previousSnapshot
      ? compactSnapshot(item.previousSnapshot)
      : null,
    evidence: stockEvidence(watchlist, brief, item),
  })),
  deterministicSignals: brief.deterministicInsights.map((insight) => ({
    id: insight.id,
    symbol: insight.symbol,
    type: insight.type,
    severity: insight.severity,
    title: insight.title,
    summary: insight.summary,
    evidence: insight.evidence,
  })),
})

export const prepareWatchlistIntelligenceBrief = (
  brief: WatchlistBrief,
  enabled: boolean,
): WatchlistBrief => ({
  ...brief,
  experimentalInsights: [],
  prioritizedSignalIds: [],
  prioritizedEvidenceIds: [],
  aiSummary: null,
  aiAssessments: [],
  crossStockPatterns: [],
  aiUncertainties: [],
  modelStatus: enabled ? 'loading' : 'disabled',
})

export const applyWatchlistIntelligenceResult = (
  current: Watchlist,
  requestedReviewAt: string | null,
  intelligenceBrief: WatchlistBrief,
): Watchlist =>
  current.lastReviewAt === requestedReviewAt &&
  current.modelPreferences.enablePhi
    ? { ...current, latestBrief: intelligenceBrief }
    : current

const patternToInsight = (
  pattern: WatchlistPattern,
  generatedAt: string,
  index: number,
  evidenceById: Map<string, PacketEvidence>,
): WatchlistInsight => ({
  id: `experimental_pattern:watchlist:${index}`,
  symbol: null,
  type: 'experimental_pattern',
  severity: 'informational',
  title: pattern.title,
  summary: `${pattern.explanation} ${pattern.thesisRelationship}`,
  evidence: pattern.evidenceIds.map((evidenceId) => ({
    label: evidenceId,
    current: evidenceById.get(evidenceId)?.text ?? 'Verified evidence',
    previous: null,
  })),
  generatedAt,
})

const unavailableBrief = (
  brief: WatchlistBrief,
  status: 'fallback' | 'rate_limited',
): WatchlistBrief => ({
  ...brief,
  experimentalInsights: [],
  prioritizedSignalIds: [],
  prioritizedEvidenceIds: [],
  aiSummary: null,
  aiAssessments: [],
  crossStockPatterns: [],
  aiUncertainties: [],
  modelStatus: status,
})

export const requestWatchlistIntelligence = async (
  watchlist: Watchlist,
  brief: WatchlistBrief,
  thesis: InvestmentThesis,
): Promise<WatchlistBrief> => {
  if (!watchlist.modelPreferences.enablePhi) {
    return prepareWatchlistIntelligenceBrief(brief, false)
  }

  const requestPacket = createWatchlistIntelligencePacket(
    watchlist,
    brief,
    thesis,
  )

  try {
    const response = await fetch('/api/watchlist-intelligence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-watchlist-client': getClientId(),
      },
      body: JSON.stringify(requestPacket),
    })

    if (response.status === 429) {
      throw new RateLimitError('Watchlist intelligence is rate limited.')
    }
    if (!response.ok) {
      throw new Error(`Intelligence endpoint returned HTTP ${response.status}.`)
    }

    const intelligence = responseSchema.parse(await response.json())
    const signalsById = new Map(
      brief.deterministicInsights.map((insight) => [insight.id, insight]),
    )
    const prioritized = intelligence.prioritizedSignalIds
      .map((id) => signalsById.get(id))
      .filter((insight): insight is WatchlistInsight => insight != null)
    const prioritizedIds = new Set(prioritized.map((insight) => insight.id))
    const remaining = brief.deterministicInsights.filter(
      (insight) => !prioritizedIds.has(insight.id),
    )
    const evidenceById = new Map(
      requestPacket.stocks.flatMap((stock) =>
        stock.evidence.map((evidence) => [evidence.id, evidence] as const),
      ),
    )
    requestPacket.deterministicSignals.forEach((signal) => {
      evidenceById.set(signal.id, {
        id: signal.id,
        symbol: signal.symbol ?? 'watchlist',
        text: compactText(
          `${signal.title}. ${signal.summary}. ${signal.evidence
            .map(
              (item) =>
                `${item.label}: ${item.current}${
                  item.previous ? `; previously ${item.previous}` : ''
                }`,
            )
            .join('. ')}`,
        ),
      })
    })

    return {
      ...brief,
      deterministicInsights: [...prioritized, ...remaining],
      experimentalInsights: intelligence.experimentalPatterns.map(
        (pattern, index) =>
          patternToInsight(pattern, brief.generatedAt, index, evidenceById),
      ),
      prioritizedSignalIds: intelligence.prioritizedSignalIds,
      prioritizedEvidenceIds: intelligence.prioritizedEvidenceIds,
      aiSummary: intelligence.summary,
      aiAssessments: intelligence.assessments,
      crossStockPatterns: intelligence.crossStockPatterns,
      aiUncertainties: intelligence.uncertainties,
      modelStatus: 'generated',
    }
  } catch (error) {
    return unavailableBrief(
      brief,
      error instanceof RateLimitError ? 'rate_limited' : 'fallback',
    )
  }
}
