import { z } from 'zod'
import type { InvestmentThesis } from '../domain/thesis'
import type {
  Watchlist,
  WatchlistBrief,
  WatchlistInsight,
} from '../domain/watchlist'

const clientStorageKey = 'knowyourstocks.intelligenceClient'

const responseSchema = z.object({
  prioritizedSignalIds: z.array(z.string()),
  summary: z.string(),
  experimentalPatterns: z.array(
    z.object({
      title: z.string(),
      explanation: z.string(),
      evidenceIds: z.array(z.string()).min(2),
      confidence: z.enum(['low', 'medium', 'high']),
      thesisRelationship: z.string(),
    }),
  ),
  uncertainties: z.array(z.string()),
})

const getClientId = () => {
  const existing = window.localStorage.getItem(clientStorageKey)

  if (existing) {
    return existing
  }

  const value = crypto.randomUUID()
  window.localStorage.setItem(clientStorageKey, value)
  return value
}

const packet = (
  watchlist: Watchlist,
  brief: WatchlistBrief,
  thesis: InvestmentThesis,
) => ({
  version: 1 as const,
  thesis: {
    sectors: thesis.sectors,
    horizon: thesis.horizon,
    risk: thesis.risk,
    style: thesis.style,
    ...(watchlist.modelPreferences.includeThesisNote && thesis.note.trim()
      ? { note: thesis.note.trim() }
      : {}),
  },
  watchlist: watchlist.items.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    sector: item.currentSnapshot.sector,
    industry: item.currentSnapshot.industry,
    fit: item.currentFit.total,
    fitLabel: item.currentFit.label,
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
  stableSymbols: brief.stableSymbols,
})

const patternToInsight = (
  pattern: z.infer<typeof responseSchema>['experimentalPatterns'][number],
  generatedAt: string,
  index: number,
  evidenceById: Map<string, WatchlistInsight>,
): WatchlistInsight => ({
  id: `experimental_pattern:watchlist:${index}`,
  symbol: null,
  type: 'experimental_pattern',
  severity: 'informational',
  title: pattern.title,
  summary: `${pattern.explanation} ${pattern.thesisRelationship}`,
  evidence: pattern.evidenceIds.map((evidenceId) => {
    const evidence = evidenceById.get(evidenceId)
    return {
      label: evidence?.title ?? 'Verified signal',
      current: evidence?.summary ?? evidenceId,
      previous: null,
    }
  }),
  generatedAt,
})

export const requestWatchlistIntelligence = async (
  watchlist: Watchlist,
  brief: WatchlistBrief,
  thesis: InvestmentThesis,
): Promise<WatchlistBrief> => {
  try {
    const response = await fetch('/api/watchlist-intelligence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-watchlist-client': getClientId(),
      },
      body: JSON.stringify(packet(watchlist, brief, thesis)),
    })

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

    return {
      ...brief,
      deterministicInsights: [...prioritized, ...remaining],
      experimentalInsights: intelligence.experimentalPatterns.map(
        (pattern, index) =>
          patternToInsight(pattern, brief.generatedAt, index, signalsById),
      ),
      aiSummary: intelligence.summary,
      aiUncertainties: intelligence.uncertainties,
      modelStatus: 'generated',
    }
  } catch {
    return {
      ...brief,
      experimentalInsights: [],
      aiSummary: null,
      aiUncertainties: [],
      modelStatus: 'fallback',
    }
  }
}
