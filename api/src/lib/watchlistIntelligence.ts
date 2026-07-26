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

const legacyEvidenceSchema = z
  .object({
    label: z.string().max(120),
    current: z.string().max(160),
    previous: z.string().max(160).nullable(),
  })
  .strict()

const signalSchema = z
  .object({
    id: z.string().min(1).max(180),
    symbol: z.string().max(16).nullable(),
    type: z.string().max(60),
    severity: z.enum(['attention', 'watch', 'informational', 'stable']),
    title: z.string().max(180),
    summary: z.string().max(500),
    evidence: z.array(legacyEvidenceSchema).max(8),
  })
  .strict()

const stockSchema = z
  .object({
    symbol: z.string().min(1).max(16),
    name: z.string().min(1).max(160),
    sector: z.string().max(120).nullable().optional(),
    industry: z.string().max(120).nullable().optional(),
    currentSnapshot: compactSnapshotSchema.optional(),
    previousSnapshot: compactSnapshotSchema.nullable().optional(),
    evidence: z.array(groundedEvidenceSchema).min(1).max(16),
  })
  .strict()

export const watchlistIntelligenceRequestSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    thesis: thesisSchema,
    stocks: z.array(stockSchema).max(25).optional().default([]),
    deterministicSignals: z.array(signalSchema).max(75).optional().default([]),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.version === 2 && request.stocks.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Version 2 watchlist reviews require at least one stock.',
      })
    }
    const symbols = request.stocks.map((stock) => stock.symbol.toUpperCase())
    if (new Set(symbols).size !== symbols.length) {
      context.addIssue({
        code: 'custom',
        message: 'Watchlist stocks must have unique symbols.',
      })
    }
    const evidenceIds = [
      ...request.stocks.flatMap((stock) =>
        stock.evidence.map((evidence) => evidence.id.toLowerCase()),
      ),
      ...request.deterministicSignals.map((signal) => signal.id.toLowerCase()),
    ]
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Watchlist evidence IDs must be unique.',
      })
    }
  })

const modelClaimSchema = z
  .object({
    text: z.string().min(1).max(180).regex(/^[^0-9]*$/),
    citationIds: z.array(z.string()).min(1).max(2),
  })
  .strict()

const modelStockSchema = z
  .object({
    symbol: z.string(),
    opinion: opinionSchema,
    whatChanged: modelClaimSchema,
    whyItFits: z.array(modelClaimSchema).min(1).max(1),
    concerns: z.array(modelClaimSchema).min(1).max(1),
    whatToWatchNext: z.array(modelClaimSchema).min(1).max(1),
    confidence: confidenceSchema,
  })
  .strict()

const modelPatternSchema = z
  .object({
    title: z.string().min(1).max(100).regex(/^[^0-9]*$/),
    summary: z.string().min(1).max(180).regex(/^[^0-9]*$/),
    citationIds: z.array(z.string()).min(2).max(4),
    confidence: confidenceSchema,
  })
  .strict()

const watchlistModelSchema = z
  .object({
    overallOpinion: opinionSchema,
    overallSummary: modelClaimSchema,
    prioritizedEvidenceIds: z.array(z.string()).max(8),
    stocks: z.array(modelStockSchema).max(25),
    crossStockPatterns: z.array(z.unknown()).max(3),
  })
  .strict()

const citedClaimSchema = z
  .object({
    text: z.string(),
    citationIds: z.array(z.string()),
    citations: z.array(mappedCitationSchema),
  })
  .strict()

const stockOpinionSchema = z
  .object({
    symbol: z.string(),
    opinion: opinionSchema,
    whatChanged: citedClaimSchema,
    whyItFits: z.array(citedClaimSchema).min(1).max(1),
    concerns: z.array(citedClaimSchema).min(1).max(1),
    whatToWatchNext: z.array(citedClaimSchema).min(1).max(1),
    confidence: confidenceSchema,
  })
  .strict()

const patternSchema = z
  .object({
    title: z.string().min(1).max(100),
    summary: z.string().min(1).max(180),
    citationIds: z.array(z.string()).min(2).max(4),
    citations: z.array(mappedCitationSchema).min(2).max(4),
    confidence: confidenceSchema,
  })
  .strict()

export const watchlistIntelligenceResponseSchema = z
  .object({
    overallOpinion: opinionSchema,
    overallSummary: citedClaimSchema,
    prioritizedSignalIds: z.array(z.string()).max(75),
    prioritizedEvidenceIds: z.array(z.string()).max(8),
    prioritizedEvidence: z.array(mappedCitationSchema).max(8),
    stocks: z.array(stockOpinionSchema).max(25),
    crossStockPatterns: z.array(patternSchema).max(1),
  })
  .strict()

export type WatchlistIntelligenceRequest = z.infer<
  typeof watchlistIntelligenceRequestSchema
>
export type WatchlistIntelligenceOutput = z.infer<
  typeof watchlistIntelligenceResponseSchema
>

export const parseIntelligenceRequest = (
  value: unknown,
): WatchlistIntelligenceRequest =>
  parseIntelligenceRequestBody(watchlistIntelligenceRequestSchema, value)

const claimJsonSchema = (evidenceIds: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['text', 'citationIds'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 180 },
    citationIds: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: { type: 'string', enum: evidenceIds },
    },
  },
})

const watchlistResponseJsonSchema = (
  evidenceIds: string[],
  symbols: string[],
): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: [
    'overallOpinion',
    'overallSummary',
    'prioritizedEvidenceIds',
    'stocks',
    'crossStockPatterns',
  ],
  properties: {
    overallOpinion: { type: 'string', enum: opinionSchema.options },
    overallSummary: { $ref: '#/$defs/claim' },
    prioritizedEvidenceIds: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', enum: evidenceIds },
    },
    stocks: {
      type: 'array',
      maxItems: 25,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'symbol',
          'opinion',
          'whatChanged',
          'whyItFits',
          'concerns',
          'whatToWatchNext',
          'confidence',
        ],
        properties: {
          symbol: { type: 'string', enum: symbols },
          opinion: { type: 'string', enum: opinionSchema.options },
          whatChanged: { $ref: '#/$defs/claim' },
          whyItFits: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: { $ref: '#/$defs/claim' },
          },
          concerns: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: { $ref: '#/$defs/claim' },
          },
          whatToWatchNext: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: { $ref: '#/$defs/claim' },
          },
          confidence: { type: 'string', enum: confidenceSchema.options },
        },
      },
    },
    crossStockPatterns: {
      type: 'array',
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'citationIds', 'confidence'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 100 },
          summary: { type: 'string', minLength: 1, maxLength: 180 },
          citationIds: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: { type: 'string', enum: evidenceIds },
          },
          confidence: { type: 'string', enum: confidenceSchema.options },
        },
      },
    },
  },
  $defs: { claim: claimJsonSchema(evidenceIds) },
})

const signalToEvidence = (
  signal: z.infer<typeof signalSchema>,
): GroundedEvidence => ({
  id: signal.id,
  symbol: signal.symbol ?? 'watchlist',
  text: [
    signal.title,
    signal.summary,
    ...signal.evidence.map(
      (item) =>
        `${item.label}: ${item.current}${item.previous ? `; previously ${item.previous}` : ''}`,
    ),
  ].join('. '),
})

const requestEvidence = (request: WatchlistIntelligenceRequest) => [
  ...request.stocks.flatMap((stock) => stock.evidence),
  ...request.deterministicSignals.map(signalToEvidence),
]

const suppliedSymbols = (request: WatchlistIntelligenceRequest) =>
  request.stocks.map((stock) => stock.symbol)

const canonicalSymbol = (value: string, symbols: Map<string, string>) => {
  const symbol = symbols.get(value.trim().toUpperCase())
  if (!symbol) throw new Error('Model returned an out-of-set symbol.')
  return symbol
}

const validateAttachment = (
  evidence: GroundedEvidence[],
  symbol: string,
) => {
  if (evidence.some((item) => item.symbol.toUpperCase() !== symbol.toUpperCase())) {
    throw new Error('Model returned misattached evidence IDs.')
  }
  return evidence
}

const normalizeWatchlistOutput = (
  value: unknown,
  request: WatchlistIntelligenceRequest,
): WatchlistIntelligenceOutput => {
  const model = watchlistModelSchema.parse(value)
  const evidence = requestEvidence(request)
  const catalog = createEvidenceCatalog(evidence)
  const symbols = new Map(
    suppliedSymbols(request).map((symbol) => [symbol.toUpperCase(), symbol]),
  )

  if (model.stocks.length !== symbols.size) {
    throw new Error('Model must assess every supplied watchlist stock once.')
  }

  const mapClaim = (
    claim: z.infer<typeof modelClaimSchema>,
    symbol?: string,
  ) => {
    let claimEvidence = catalog.resolveIds(claim.citationIds, {
      min: 1,
      max: 2,
    })
    if (symbol) claimEvidence = validateAttachment(claimEvidence, symbol)
    assertNoProhibitedAdvice([claim.text])
    assertNoNumericNarrative([claim.text])
    assertNoInventedNumericClaims(claim.text, claimEvidence)
    return {
      text: claim.text,
      citationIds: claimEvidence.map((item) => item.id),
      citations: mapCitations(claimEvidence),
    }
  }

  const stocks = model.stocks.map((stock) => {
    const symbol = canonicalSymbol(stock.symbol, symbols)
    return {
      symbol,
      opinion: stock.opinion,
      whatChanged: mapClaim(stock.whatChanged, symbol),
      whyItFits: stock.whyItFits.map((claim) => mapClaim(claim, symbol)),
      concerns: stock.concerns.map((claim) => mapClaim(claim, symbol)),
      whatToWatchNext: stock.whatToWatchNext.map((claim) =>
        mapClaim(claim, symbol),
      ),
      confidence: stock.confidence,
    }
  })

  const stockSymbols = stocks.map((stock) => stock.symbol.toUpperCase())
  if (
    new Set(stockSymbols).size !== symbols.size ||
    [...symbols.keys()].some((symbol) => !stockSymbols.includes(symbol))
  ) {
    throw new Error('Model must assess every supplied watchlist stock once.')
  }

  const prioritized = catalog.resolveIds(model.prioritizedEvidenceIds, {
    max: 75,
  })
  const patterns = model.crossStockPatterns
    .flatMap((rawPattern) => {
      const parsed = modelPatternSchema.safeParse(rawPattern)
      if (!parsed.success) return []

      try {
        const pattern = parsed.data
        const citationIds = [...new Set(pattern.citationIds)]
        if (citationIds.length < 2) return []

        const patternEvidence = catalog.resolveIds(citationIds, {
          min: 2,
          max: 4,
        })
        if (
          patternEvidence.some(
            (item) => !symbols.has(item.symbol.toUpperCase()),
          )
        ) {
          return []
        }
        const distinctSymbols = new Set(
          patternEvidence.map((item) => item.symbol.toUpperCase()),
        )
        if (distinctSymbols.size < 2) return []

        assertNoProhibitedAdvice([pattern.title, pattern.summary])
        assertNoNumericNarrative([pattern.title, pattern.summary])
        assertNoInventedNumericClaims(pattern.title, patternEvidence)
        assertNoInventedNumericClaims(pattern.summary, patternEvidence)
        return [
          {
            ...pattern,
            citationIds: patternEvidence.map((item) => item.id),
            citations: mapCitations(patternEvidence),
          },
        ]
      } catch {
        return []
      }
    })
    .slice(0, 1)

  const overallSummary = mapClaim(model.overallSummary)
  const signalIds = new Set(
    request.deterministicSignals.map((signal) => signal.id),
  )
  const prioritizedEvidenceIds = prioritized.map((item) => item.id)

  return watchlistIntelligenceResponseSchema.parse({
    overallOpinion: model.overallOpinion,
    overallSummary,
    prioritizedSignalIds: prioritizedEvidenceIds.filter((id) =>
      signalIds.has(id),
    ),
    prioritizedEvidenceIds,
    prioritizedEvidence: mapCitations(prioritized),
    stocks,
    crossStockPatterns: patterns,
  })
}

export const generateWatchlistIntelligence = async (
  request: WatchlistIntelligenceRequest,
  clientId: string,
): Promise<WatchlistIntelligenceOutput> => {
  const evidence = requestEvidence(request)
  if (evidence.length === 0) {
    return {
      overallOpinion: 'Insufficient evidence',
      overallSummary: {
        text: 'No verified watchlist evidence was supplied for review.',
        citationIds: [],
        citations: [],
      },
      prioritizedSignalIds: [],
      prioritizedEvidenceIds: [],
      prioritizedEvidence: [],
      stocks: [],
      crossStockPatterns: [],
    }
  }

  const symbols = suppliedSymbols(request)
  const catalog = createEvidenceCatalog(evidence)
  return callGroundedModel({
    operation: 'watchlist',
    request,
    clientId,
    maxTokens: Math.max(1_400, Math.min(3_000, 350 + symbols.length * 110)),
    attemptTimeoutMs: 20_000,
    reasoningEffort: 'low',
    responseSchema: {
      name: 'watchlist_opinions',
      schema: watchlistResponseJsonSchema(
        evidence.map((item) => item.id),
        symbols,
      ),
    },
    systemPrompt:
      'Review every supplied watchlist stock using only supplied evidence. Include stable stocks and use the exact text "No material change" when no verified change is present. Opinions are research labels, not trade instructions. Generated narrative text must contain no digits or numeric values. Do not return scores, prices, targets, guarantees, predictions, or invented facts.',
    userPrompt: `Thesis: ${request.thesis.style}; ${request.thesis.horizon}; ${request.thesis.risk}; sectors ${request.thesis.sectors.join(', ')}
${request.thesis.note ? `Optional thesis note: ${request.thesis.note}\n` : ''}Watchlist symbols: ${symbols.join(', ')}
Evidence:
${catalog.lines.join('\n')}
Return overallOpinion, a cited overallSummary, verified prioritizedEvidenceIds, every supplied stock exactly once, and at most one optional crossStockPattern. Each stock requires symbol, opinion, cited whatChanged (or exact "No material change"), exactly one concise cited whyItFits point, exactly one concise cited concern, exactly one concise cited whatToWatchNext point, and confidence. Use exact supplied evidence IDs shown in parentheses, never evidence aliases. Each stock claim cites evidence belonging to that stock. A cross-stock pattern must cite at least two distinct real supplied symbols. Do not return any score.`,
    normalize: (value) => normalizeWatchlistOutput(value, request),
  })
}
