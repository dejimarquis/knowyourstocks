import { z } from 'zod'
import type { SecuritySnapshot } from '../data/alphaVantage'
import { fetchFinnhubPeers, fetchFinnhubSecurity } from '../data/finnhub'
import { enrichWithSecFallback } from '../data/sec'
import type { InvestmentThesis } from '../domain/thesis'
import { scoreSecurity, type FitScore } from '../scoring/scoreSecurity'
import {
  discoverUniverse,
  discoverUniverseBySymbol,
  discoverUniverseVersion,
} from './universe'

const maximumCandidateFetches = 8
const recommendationCount = 5
const maximumSecEnrichments = 3
const clientStorageKey = 'knowyourstocks.intelligenceClient'

const intelligenceResponseSchema = z.object({
  rankings: z.array(
    z.object({
      symbol: z.string(),
      score: z.number().int().min(0).max(100),
      opinion: z.enum([
        'Compelling',
        'Promising but mixed',
        'Watch closely',
        'Reconsider',
      ]),
      confidence: z.enum(['low', 'medium', 'high']),
      rationale: z.string(),
      risk: z.string(),
    }),
  ),
})

export type DiscoverRecommendation = {
  snapshot: SecuritySnapshot
  fit: FitScore
  reason: string
  risk: string
  aiScore: number | null
  aiOpinion: string | null
  aiConfidence: 'low' | 'medium' | 'high' | null
}

export type DiscoverResult = {
  version: 1
  universeVersion: number
  generatedAt: string
  modelStatus: 'generated' | 'fallback' | 'not_requested'
  recommendations: DiscoverRecommendation[]
  providerErrors: number
}

export type DiscoverInput = {
  thesis: InvestmentThesis
  watchedSymbols: Iterable<string>
  finnhubKey: string
  recentSymbols?: string[]
  currentSymbol?: string | null
}

type IntelligenceCandidate = {
  snapshot: SecuritySnapshot
  fit: FitScore
}

type DiscoverDependencies = {
  fetchPeers: typeof fetchFinnhubPeers
  fetchSecurity: typeof fetchFinnhubSecurity
  enrichSecurity: typeof enrichWithSecFallback
  requestIntelligence: typeof requestRecommendationIntelligence
  now: () => Date
}

const normalizeSymbols = (symbols: Iterable<string>) =>
  new Set(
    [...symbols]
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  )

const candidatePriority = (
  symbol: string,
  thesis: InvestmentThesis,
  peers: Set<string>,
) => {
  const security = discoverUniverseBySymbol.get(symbol)
  if (!security) {
    return Number.NEGATIVE_INFINITY
  }

  const themeMatches = security.themes.filter((theme) =>
    thesis.sectors.includes(theme),
  ).length
  return themeMatches * 100 + (security.styles.includes(thesis.style) ? 20 : 0) +
    (peers.has(symbol) ? 12 : 0)
}

export const selectDiscoverCandidateSymbols = (
  thesis: InvestmentThesis,
  peerSymbols: string[],
  watchedSymbols: Iterable<string>,
  currentSymbol?: string | null,
) => {
  const excluded = normalizeSymbols(watchedSymbols)
  if (currentSymbol) {
    excluded.add(currentSymbol.trim().toUpperCase())
  }
  const validPeers = new Set(
    peerSymbols
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => discoverUniverseBySymbol.has(symbol)),
  )

  return discoverUniverse
    .map((security, index) => ({
      symbol: security.symbol,
      index,
      priority: candidatePriority(security.symbol, thesis, validPeers),
    }))
    .filter((candidate) => !excluded.has(candidate.symbol))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .slice(0, maximumCandidateFetches)
    .map((candidate) => candidate.symbol)
}

const deterministicReason = (candidate: IntelligenceCandidate) => {
  const factor = candidate.fit.factors
    .filter((item) => item.available)
    .sort(
      (left, right) =>
        right.earned / right.maximum - left.earned / left.maximum,
    )[0]
  return factor?.evidence ?? 'Available fundamentals support this thesis comparison.'
}

const deterministicRisk = (candidate: IntelligenceCandidate) => {
  const missing = candidate.fit.factors.find((factor) => !factor.available)
  if (missing) {
    return `${missing.label} is a gap: ${missing.evidence}`
  }

  const weakest = candidate.fit.factors
    .filter((factor) => factor.available)
    .sort(
      (left, right) =>
        left.earned / left.maximum - right.earned / right.maximum,
    )[0]

  if (!weakest || weakest.earned / weakest.maximum >= 0.8) {
    return 'No major thesis conflict is visible in the bounded evidence; verify valuation, catalysts, and company-specific risks before drawing a conclusion.'
  }

  return `${weakest.label} is the weakest current factor: ${weakest.evidence}`
}

const evidenceFor = (candidate: IntelligenceCandidate) => {
  const symbol = candidate.snapshot.symbol
  const evidence = candidate.fit.factors
    .filter((factor) => factor.available)
    .slice(0, 5)
    .map((factor, index) => ({
      id: `${symbol.toLowerCase()}-${factor.key}-${index}`,
      symbol,
      text: `${factor.label}: ${factor.evidence}`,
    }))

  return evidence.length > 0
    ? evidence
    : [
        {
          id: `${symbol.toLowerCase()}-provider`,
          symbol,
          text: `${symbol} has a current normalized Finnhub snapshot.`,
        },
      ]
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

export const requestRecommendationIntelligence = async (
  thesis: InvestmentThesis,
  candidates: IntelligenceCandidate[],
) => {
  if (candidates.length !== recommendationCount) {
    throw new Error('Recommendation intelligence requires exactly five candidates.')
  }

  const response = await fetch('/api/recommendation-intelligence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-intelligence-client': getClientId(),
    },
    body: JSON.stringify({
      version: 1,
      thesis: {
        sectors: thesis.sectors,
        horizon: thesis.horizon,
        risk: thesis.risk,
        style: thesis.style,
      },
      candidates: candidates.map((candidate) => ({
        symbol: candidate.snapshot.symbol,
        name: candidate.snapshot.name,
        deterministicFit: candidate.fit.total,
        snapshot: {
          earningsGrowth: candidate.snapshot.earningsGrowth,
          operatingMargin: candidate.snapshot.operatingMargin,
          freeCashFlow: candidate.snapshot.freeCashFlow,
          debtToEquity: candidate.snapshot.debtToEquity,
          currentRatio: candidate.snapshot.currentRatio,
          metricProvenance: candidate.snapshot.metricProvenance,
        },
        evidence: evidenceFor(candidate),
      })),
    }),
  })

  if (!response.ok) {
    throw new Error(`Recommendation intelligence returned HTTP ${response.status}.`)
  }

  const intelligence = intelligenceResponseSchema.parse(await response.json())
  const supplied = new Set(
    candidates.map((candidate) => candidate.snapshot.symbol),
  )
  const ranked = intelligence.rankings
  if (
    ranked.length !== recommendationCount ||
    new Set(ranked.map((item) => item.symbol)).size !== recommendationCount ||
    ranked.some((item) => !supplied.has(item.symbol))
  ) {
    throw new Error('Recommendation intelligence returned an invalid ranking.')
  }
  return ranked
}

const defaultDependencies: DiscoverDependencies = {
  fetchPeers: fetchFinnhubPeers,
  fetchSecurity: fetchFinnhubSecurity,
  enrichSecurity: enrichWithSecFallback,
  requestIntelligence: requestRecommendationIntelligence,
  now: () => new Date(),
}

export const discoverRecommendations = async (
  input: DiscoverInput,
  dependencies: Partial<DiscoverDependencies> = {},
): Promise<DiscoverResult> => {
  const key = input.finnhubKey.trim()
  if (!key) {
    throw new Error('A Finnhub API key is required to discover stocks.')
  }
  const services = { ...defaultDependencies, ...dependencies }
  const seeds = [
    ...new Set(
      [input.currentSymbol, ...(input.recentSymbols ?? [])]
        .filter((symbol): symbol is string => Boolean(symbol))
        .map((symbol) => symbol.trim().toUpperCase()),
    ),
  ].slice(0, 2)
  let peerSymbols: string[] = []
  let providerErrors = 0

  if (seeds.length > 0) {
    try {
      peerSymbols = await services.fetchPeers(seeds, key)
    } catch {
      providerErrors += 1
    }
  }

  const symbols = selectDiscoverCandidateSymbols(
    input.thesis,
    peerSymbols,
    input.watchedSymbols,
    input.currentSymbol,
  )
  const settled = await Promise.allSettled(
    symbols.map((symbol) => services.fetchSecurity(symbol, key)),
  )
  providerErrors += settled.filter((result) => result.status === 'rejected').length
  let candidates = settled.flatMap((result, index) => {
    if (result.status !== 'fulfilled') {
      return []
    }
    const snapshot = result.value
    if (
      snapshot.symbol.toUpperCase() !== symbols[index] ||
      !discoverUniverseBySymbol.has(snapshot.symbol.toUpperCase())
    ) {
      providerErrors += 1
      return []
    }
    return [{ snapshot, fit: scoreSecurity(snapshot, input.thesis) }]
  })

  const enrichIndexes = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.fit.total == null)
    .slice(0, maximumSecEnrichments)
  const enriched = await Promise.all(
    enrichIndexes.map(({ candidate }) =>
      services.enrichSecurity(candidate.snapshot),
    ),
  )
  enriched.forEach((snapshot, index) => {
    const candidateIndex = enrichIndexes[index].index
    candidates[candidateIndex] = {
      snapshot,
      fit: scoreSecurity(snapshot, input.thesis),
    }
  })

  candidates = candidates
    .sort(
      (left, right) =>
        (right.fit.total ?? -1) - (left.fit.total ?? -1) ||
        symbols.indexOf(left.snapshot.symbol) -
          symbols.indexOf(right.snapshot.symbol),
    )
    .slice(0, recommendationCount)

  let modelStatus: DiscoverResult['modelStatus'] =
    candidates.length === recommendationCount ? 'fallback' : 'not_requested'
  let recommendations: DiscoverRecommendation[] = candidates.map((candidate) => ({
    snapshot: candidate.snapshot,
    fit: candidate.fit,
    reason: deterministicReason(candidate),
    risk: deterministicRisk(candidate),
    aiScore: null,
    aiOpinion: null,
    aiConfidence: null,
  }))

  if (candidates.length === recommendationCount) {
    try {
      const rankings = await services.requestIntelligence(
        input.thesis,
        candidates,
      )
      const bySymbol = new Map(
        recommendations.map((recommendation) => [
          recommendation.snapshot.symbol,
          recommendation,
        ]),
      )
      recommendations = rankings.map((ranking) => {
        const recommendation = bySymbol.get(ranking.symbol)
        if (!recommendation) {
          throw new Error('Recommendation intelligence invented a candidate.')
        }
        return {
          ...recommendation,
          reason: ranking.rationale,
          risk: ranking.risk,
          aiScore: ranking.score,
          aiOpinion: ranking.opinion,
          aiConfidence: ranking.confidence,
        }
      })
      modelStatus = 'generated'
    } catch {
      modelStatus = 'fallback'
    }
  }

  return {
    version: 1,
    universeVersion: discoverUniverseVersion,
    generatedAt: services.now().toISOString(),
    modelStatus,
    recommendations,
    providerErrors,
  }
}
