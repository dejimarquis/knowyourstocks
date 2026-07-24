import { z } from 'zod'
import {
  asRecord,
  assertNoInventedNumericClaims,
  assertNoProhibitedAdvice,
  callGroundedModel,
  compactSnapshotSchema,
  confidenceSchema,
  createEvidenceCatalog,
  groundedEvidenceSchema,
  normalizeConfidence,
  normalizeOpinion,
  normalizeScore,
  opinionSchema,
  pick,
  thesisSchema,
  type GroundedEvidence,
} from './groundedIntelligence'

const candidateSchema = z.object({
  symbol: z.string().min(1).max(16),
  name: z.string().min(1).max(160),
  deterministicFit: z.number().min(0).max(100).nullable().optional(),
  snapshot: compactSnapshotSchema.optional(),
  evidence: z.array(groundedEvidenceSchema).min(1).max(12),
})

export const recommendationIntelligenceRequestSchema = z
  .object({
    version: z.literal(1),
    thesis: thesisSchema,
    candidates: z.array(candidateSchema).min(1).max(8),
  })
  .superRefine((request, context) => {
    const symbols = request.candidates.map((item) => item.symbol.toUpperCase())
    if (new Set(symbols).size !== symbols.length) {
      context.addIssue({
        code: 'custom',
        message: 'Recommendation candidates must have unique symbols.',
      })
    }
    const evidenceIds = request.candidates.flatMap((item) =>
      item.evidence.map((evidence) => evidence.id.toLowerCase()),
    )
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Recommendation evidence IDs must be unique.',
      })
    }
  })

const mappedEvidenceSchema = z.object({
  evidenceId: z.string(),
  text: z.string(),
})

const rankedRecommendationSchema = z.object({
  symbol: z.string(),
  score: z.number().int().min(0).max(100),
  opinion: opinionSchema,
  confidence: confidenceSchema,
  rationale: z.string().min(1).max(240),
  risk: z.string().min(1).max(240),
  rationaleEvidence: z.array(mappedEvidenceSchema).min(1).max(3),
  riskEvidence: z.array(mappedEvidenceSchema).min(1).max(3),
})

export const recommendationIntelligenceResponseSchema = z.object({
  rankings: z.array(rankedRecommendationSchema).min(1).max(5),
})

export type RecommendationIntelligenceRequest = z.infer<
  typeof recommendationIntelligenceRequestSchema
>
export type RecommendationIntelligenceResponse = z.infer<
  typeof recommendationIntelligenceResponseSchema
>

export const parseRecommendationIntelligenceRequest = (
  value: unknown,
): RecommendationIntelligenceRequest =>
  recommendationIntelligenceRequestSchema.parse(value)

const canonicalSymbol = (
  value: unknown,
  candidates: Map<string, string>,
) => {
  if (typeof value !== 'string') {
    throw new Error('Model returned an out-of-set symbol.')
  }
  const symbol = candidates.get(value.trim().toUpperCase())
  if (!symbol) {
    throw new Error('Model returned an out-of-set symbol.')
  }
  return symbol
}

const evidenceForSymbol = (
  evidence: GroundedEvidence[],
  symbol: string,
) => {
  if (evidence.some((item) => item.symbol.toUpperCase() !== symbol.toUpperCase())) {
    throw new Error('Model returned misattached evidence IDs.')
  }
  return evidence
}

const normalizeRecommendationOutput = (
  value: unknown,
  request: RecommendationIntelligenceRequest,
): RecommendationIntelligenceResponse => {
  const record = asRecord(value)
  const allEvidence = request.candidates.flatMap((candidate) => candidate.evidence)
  const catalog = createEvidenceCatalog(allEvidence)
  const candidates = new Map(
    request.candidates.map((candidate) => [
      candidate.symbol.toUpperCase(),
      candidate.symbol,
    ]),
  )
  const candidateBySymbol = new Map(
    request.candidates.map((candidate) => [
      candidate.symbol.toUpperCase(),
      candidate,
    ]),
  )
  const expectedCount = Math.min(5, request.candidates.length)
  const rawRankings = pick(record, ['rankings', 'Rankings'])
  let rankings: Array<Record<string, unknown>>
  const symbolMapRankings = Object.entries(record)
    .filter(([symbol, value]) => {
      const canonical = candidates.has(symbol.toUpperCase())
      return canonical && typeof value === 'object' && value !== null
    })
    .map(([symbol, value]) => ({
      symbol,
      ...asRecord(value),
    }))

  if (symbolMapRankings.length === expectedCount) {
    rankings = symbolMapRankings
  } else if (
    Array.isArray(rawRankings) &&
    rawRankings.every(
      (item) => typeof item === 'object' && item !== null,
    )
  ) {
    rankings = rawRankings.map(asRecord)
  } else {
    const ordered = Array.isArray(rawRankings)
      ? rawRankings
      : pick(record, [
          'rankedSymbols',
          'RankedSymbols',
          'ranked_symbols',
          'orderedSymbols',
          'ordered_symbols',
          'priority_order',
          'order',
        ])
    const rationales = pick(record, ['rationales', 'Rationales'])
    if (!Array.isArray(ordered)) {
      throw new Error('Model returned an invalid recommendation ranking.')
    }
    const rationaleRecords = Array.isArray(rationales)
      ? rationales.map(asRecord)
      : []
    rankings = ordered.map((symbol) => {
      const canonical = canonicalSymbol(symbol, candidates)
      const rationale =
        rationaleRecords.find((item) => {
          try {
            return canonicalSymbol(item.symbol, candidates) === canonical
          } catch {
            return false
          }
        }) ?? {}
      return {
        symbol: canonical,
        score: pick(rationale, ['score', 'Score', 'thesisEvidenceScore']),
        opinion: pick(rationale, ['opinion', 'Opinion']),
        confidence: pick(rationale, ['confidence', 'Confidence']),
        rationaleEvidenceIds: pick(rationale, [
          'rationaleEvidenceIds',
          'evidenceIds',
        ]),
        riskEvidenceIds: pick(rationale, [
          'riskEvidenceIds',
          'evidenceIds',
        ]),
      }
    })
  }

  if (rankings.length !== expectedCount) {
    throw new Error(
      `Model must rank exactly ${expectedCount} supplied candidates.`,
    )
  }

  const normalized = rankings.map((ranking) => {
    const symbol = canonicalSymbol(
      pick(ranking, ['symbol', 'Symbol', 'ticker']),
      candidates,
    )
    const candidate = candidateBySymbol.get(symbol.toUpperCase())
    if (!candidate) {
      throw new Error('Model returned an out-of-set symbol.')
    }
    const fallbackRationale = candidate.evidence[0]
    const fallbackRisk = candidate.evidence.at(-1) ?? fallbackRationale
    const rationaleIds = pick(ranking, [
      'rationaleEvidenceIds',
      'RationaleEvidenceIds',
      'rationale_evidence_ids',
      'evidenceIds',
      'EvidenceIds',
    ])
    const riskIds = pick(ranking, [
      'riskEvidenceIds',
      'RiskEvidenceIds',
      'risk_evidence_ids',
      'evidenceIds',
    ])
    const score = normalizeScore(
      pick(ranking, ['score', 'Score', 'thesisEvidenceScore']),
    )
    const rationaleEvidence = evidenceForSymbol(
      catalog.resolveIds(
        Array.isArray(rationaleIds) && rationaleIds.length === 0
          ? [fallbackRationale.id]
          : rationaleIds ?? [fallbackRationale.id],
        { min: 1, max: 12 },
      ).slice(0, 3),
      symbol,
    )
    const riskEvidence = evidenceForSymbol(
      catalog.resolveIds(
        Array.isArray(riskIds) && riskIds.length === 0
          ? [fallbackRisk.id]
          : riskIds ?? [fallbackRisk.id],
        { min: 1, max: 12 },
      ).slice(0, 3),
      symbol,
    )
    const rawRationale = pick(ranking, ['rationale', 'Rationale', 'reason'])
    const rawRisk = pick(ranking, ['risk', 'Risk', 'mainRisk'])
    const rationale =
      typeof rawRationale === 'string' && rawRationale.trim()
        ? rawRationale.trim()
        : rationaleEvidence[0].text
    const risk =
      typeof rawRisk === 'string' && rawRisk.trim()
        ? rawRisk.trim()
        : riskEvidence[0].text

    assertNoProhibitedAdvice([rationale, risk])
    assertNoInventedNumericClaims(rationale, rationaleEvidence)
    assertNoInventedNumericClaims(risk, riskEvidence)

    return {
      symbol,
      score,
      opinion: normalizeOpinion(
        pick(ranking, ['opinion', 'Opinion']),
        score,
      ),
      confidence: normalizeConfidence(
        pick(ranking, ['confidence', 'Confidence']) ?? 'medium',
      ),
      rationale,
      risk,
      rationaleEvidence: rationaleEvidence.map((item) => ({
        evidenceId: item.id,
        text: item.text,
      })),
      riskEvidence: riskEvidence.map((item) => ({
        evidenceId: item.id,
        text: item.text,
      })),
    }
  })

  if (new Set(normalized.map((item) => item.symbol)).size !== normalized.length) {
    throw new Error('Model returned duplicate recommendation symbols.')
  }

  return recommendationIntelligenceResponseSchema.parse({
    rankings: normalized,
  })
}

export const generateRecommendationIntelligence = async (
  request: RecommendationIntelligenceRequest,
  clientId: string,
) => {
  const evidence = request.candidates.flatMap((candidate) => candidate.evidence)
  const catalog = createEvidenceCatalog(evidence)
  const count = Math.min(5, request.candidates.length)

  return callGroundedModel({
    operation: 'recommendations',
    request,
    clientId,
    maxTokens: 450,
    attemptTimeoutMs: 18_000,
    regenerateInvalidOutput: false,
    systemPrompt:
      'Rank only supplied candidates for thesis-evidence fit. Use only supplied evidence aliases. Do not give trade instructions, predict returns, or add numeric claims to narratives.',
    userPrompt: `Thesis: ${request.thesis.style}; ${request.thesis.horizon}; ${request.thesis.risk}; sectors ${request.thesis.sectors.join(', ')}
${request.thesis.note ? `Optional thesis note: ${request.thesis.note}\n` : ''}Candidates: ${request.candidates.map((candidate) => candidate.symbol).join(', ')}
Evidence:
${catalog.lines.join('\n')}
Return rankings with exactly ${count} unique supplied symbols in order. Each item has symbol, score, opinion, confidence, rationaleEvidenceIds, and riskEvidenceIds. Score is 0-100 thesis-evidence strength, not a return forecast. Opinion must be Compelling, Promising but mixed, Watch closely, or Reconsider. Confidence must be low, medium, or high. Attach evidence only to its matching symbol. The server will map the selected evidence into user-facing prose.`,
    normalize: (value) => normalizeRecommendationOutput(value, request),
  })
}
