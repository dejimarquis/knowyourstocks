import { z } from 'zod'
import {
  assertNoInventedNumericClaims,
  assertNoNumericNarrative,
  assertNoProhibitedAdvice,
  callGroundedModel,
  compactSnapshotSchema,
  confidenceSchema,
  createEvidenceCatalog,
  groundedEvidenceSchema,
  mapCitations,
  mappedCitationSchema,
  opinionSchema,
  parseIntelligenceRequestBody,
  thesisSchema,
  type GroundedEvidence,
  type JsonSchema,
} from './groundedIntelligence'

const candidateSchema = z
  .object({
    symbol: z.string().min(1).max(16),
    name: z.string().min(1).max(160),
    deterministicFit: z.number().min(0).max(100).nullable().optional(),
    snapshot: compactSnapshotSchema.optional(),
    evidence: z.array(groundedEvidenceSchema).min(1).max(12),
  })
  .strict()

export const recommendationIntelligenceRequestSchema = z
  .object({
    version: z.literal(1),
    thesis: thesisSchema,
    candidates: z.array(candidateSchema).min(1).max(8),
  })
  .strict()
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

const modelRankingSchema = z
  .object({
    symbol: z.string(),
    opinion: opinionSchema,
    thesisRationale: z.string().min(1).max(300).regex(/^[^0-9]*$/),
    mainConcern: z.string().min(1).max(240).regex(/^[^0-9]*$/),
    whatToResearchNext: z.string().min(1).max(240).regex(/^[^0-9]*$/),
    confidence: confidenceSchema,
    citationIds: z.array(z.string()).min(1).max(5),
  })
  .strict()

const recommendationModelSchema = z
  .object({
    rankings: z.array(modelRankingSchema).min(1).max(8),
  })
  .strict()

const rankedRecommendationSchema = z
  .object({
    symbol: z.string(),
    opinion: opinionSchema,
    thesisRationale: z.string().min(1).max(300),
    mainConcern: z.string().min(1).max(240),
    whatToResearchNext: z.string().min(1).max(240),
    confidence: confidenceSchema,
    citationIds: z.array(z.string()).min(1).max(5),
    citations: z.array(mappedCitationSchema).min(1).max(5),
  })
  .strict()

export const recommendationIntelligenceResponseSchema = z
  .object({
    rankings: z.array(rankedRecommendationSchema).min(1).max(8),
  })
  .strict()

export type RecommendationIntelligenceRequest = z.infer<
  typeof recommendationIntelligenceRequestSchema
>
export type RecommendationIntelligenceResponse = z.infer<
  typeof recommendationIntelligenceResponseSchema
>

export const parseRecommendationIntelligenceRequest = (
  value: unknown,
): RecommendationIntelligenceRequest =>
  parseIntelligenceRequestBody(recommendationIntelligenceRequestSchema, value)

const recommendationResponseJsonSchema = (
  evidenceIds: string[],
  symbols: string[],
): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: ['rankings'],
  properties: {
    rankings: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'symbol',
          'opinion',
          'thesisRationale',
          'mainConcern',
          'whatToResearchNext',
          'confidence',
          'citationIds',
        ],
        properties: {
          symbol: { type: 'string', enum: symbols },
          opinion: { type: 'string', enum: opinionSchema.options },
          thesisRationale: { type: 'string' },
          mainConcern: { type: 'string' },
          whatToResearchNext: { type: 'string' },
          confidence: { type: 'string', enum: confidenceSchema.options },
          citationIds: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: { type: 'string', enum: evidenceIds },
          },
        },
      },
    },
  },
})

const canonicalSymbol = (
  value: string,
  candidates: Map<string, string>,
) => {
  const symbol = candidates.get(value.trim().toUpperCase())
  if (!symbol) throw new Error('Model returned an out-of-set symbol.')
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
  const model = recommendationModelSchema.parse(value)
  const allEvidence = request.candidates.flatMap((candidate) => candidate.evidence)
  const catalog = createEvidenceCatalog(allEvidence)
  const candidates = new Map(
    request.candidates.map((candidate) => [
      candidate.symbol.toUpperCase(),
      candidate.symbol,
    ]),
  )

  if (model.rankings.length !== request.candidates.length) {
    throw new Error(
      `Model must rank exactly ${request.candidates.length} supplied candidates.`,
    )
  }

  const rankings = model.rankings.map((ranking) => {
    const symbol = canonicalSymbol(ranking.symbol, candidates)
    const evidence = evidenceForSymbol(
      catalog.resolveIds(ranking.citationIds, { min: 1, max: 5 }),
      symbol,
    )
    const narratives = [
      ranking.thesisRationale,
      ranking.mainConcern,
      ranking.whatToResearchNext,
    ]
    assertNoProhibitedAdvice(narratives)
    assertNoNumericNarrative(narratives)
    narratives.forEach((narrative) =>
      assertNoInventedNumericClaims(narrative, evidence),
    )
    return {
      ...ranking,
      symbol,
      citationIds: evidence.map((item) => item.id),
      citations: mapCitations(evidence),
    }
  })

  if (new Set(rankings.map((item) => item.symbol.toUpperCase())).size !== rankings.length) {
    throw new Error('Model returned duplicate recommendation symbols.')
  }
  if (
    request.candidates.some(
      (candidate) =>
        !rankings.some(
          (ranking) =>
            ranking.symbol.toUpperCase() === candidate.symbol.toUpperCase(),
        ),
    )
  ) {
    throw new Error('Model omitted a supplied recommendation candidate.')
  }

  return recommendationIntelligenceResponseSchema.parse({ rankings })
}

export const generateRecommendationIntelligence = async (
  request: RecommendationIntelligenceRequest,
  clientId: string,
) => {
  const evidence = request.candidates.flatMap((candidate) => candidate.evidence)
  const catalog = createEvidenceCatalog(evidence)

  return callGroundedModel({
    operation: 'recommendations',
    request,
    clientId,
    maxTokens: 2_200,
    attemptTimeoutMs: 30_000,
    reasoningEffort: 'low',
    responseSchema: {
      name: 'recommendation_opinions',
      schema: recommendationResponseJsonSchema(
        evidence.map((item) => item.id),
        request.candidates.map((candidate) => candidate.symbol),
      ),
    },
    systemPrompt:
      'Order every supplied candidate by fit with the supplied thesis. Never add or omit candidates. Opinions are research labels, not trade instructions. Use only evidence belonging to that candidate. Generated narrative text must contain no digits or numeric values. Do not return scores, prices, targets, guarantees, predictions, or invented facts.',
    userPrompt: `Thesis: ${request.thesis.style}; ${request.thesis.horizon}; ${request.thesis.risk}; sectors ${request.thesis.sectors.join(', ')}
${request.thesis.note ? `Optional thesis note: ${request.thesis.note}\n` : ''}Candidates: ${request.candidates.map((candidate) => candidate.symbol).join(', ')}
Evidence:
${catalog.lines.join('\n')}
Return rankings containing every supplied candidate exactly once, ordered from strongest to weakest thesis fit. Each item requires symbol, opinion (Fits thesis, Mixed, Weak fit, or Insufficient evidence), concise thesisRationale, mainConcern, whatToResearchNext, confidence, and one or more exact supplied evidence IDs shown in parentheses and belonging to that symbol. Do not return evidence aliases or any score.`,
    normalize: (value) => normalizeRecommendationOutput(value, request),
  })
}
