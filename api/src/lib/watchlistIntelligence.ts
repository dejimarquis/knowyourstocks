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

const legacyEvidenceSchema = z.object({
  label: z.string().max(120),
  current: z.string().max(160),
  previous: z.string().max(160).nullable(),
})

const signalSchema = z.object({
  id: z.string().min(1).max(180),
  symbol: z.string().max(16).nullable(),
  type: z.string().max(60),
  severity: z.enum(['attention', 'watch', 'informational', 'stable']),
  title: z.string().max(180),
  summary: z.string().max(500),
  evidence: z.array(legacyEvidenceSchema).max(8),
})

const stockSchema = z.object({
  symbol: z.string().min(1).max(16),
  name: z.string().min(1).max(160),
  sector: z.string().max(120).nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  currentSnapshot: compactSnapshotSchema.optional(),
  previousSnapshot: compactSnapshotSchema.nullable().optional(),
  evidence: z.array(groundedEvidenceSchema).min(1).max(16),
})

export const watchlistIntelligenceRequestSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    thesis: thesisSchema,
    stocks: z.array(stockSchema).max(25).optional().default([]),
    deterministicSignals: z.array(signalSchema).max(75).optional().default([]),
  })
  .superRefine((request, context) => {
    if (
      request.version === 2 &&
      request.stocks.length === 0
    ) {
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

const mappedEvidenceSchema = z.object({
  evidenceId: z.string(),
  text: z.string(),
})

const assessmentSchema = z.object({
  symbol: z.string(),
  score: z.number().int().min(0).max(100),
  opinion: opinionSchema,
  summary: z.string().min(1).max(300),
  strengths: z.array(mappedEvidenceSchema).min(1).max(3),
  risks: z.array(mappedEvidenceSchema).min(1).max(3),
  confidence: confidenceSchema,
})

const patternSchema = z.object({
  title: z.string().min(1).max(120),
  explanation: z.string().min(1).max(360),
  evidenceIds: z.array(z.string()).min(2).max(8),
  confidence: confidenceSchema,
  thesisRelationship: z.string().min(1).max(240),
})

export const watchlistIntelligenceResponseSchema = z.object({
  prioritizedSignalIds: z.array(z.string()).max(75),
  prioritizedEvidenceIds: z.array(z.string()).max(75),
  summary: z.string().min(1).max(500),
  assessments: z.array(assessmentSchema).max(25),
  experimentalPatterns: z.array(patternSchema).max(3),
  crossStockPatterns: z.array(patternSchema).max(3),
  uncertainties: z.array(z.string().max(240)).max(6),
})

export type WatchlistIntelligenceRequest = z.infer<
  typeof watchlistIntelligenceRequestSchema
>
export type WatchlistIntelligenceOutput = z.infer<
  typeof watchlistIntelligenceResponseSchema
>

export const parseIntelligenceRequest = (
  value: unknown,
): WatchlistIntelligenceRequest =>
  watchlistIntelligenceRequestSchema.parse(value)

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

const suppliedSymbols = (request: WatchlistIntelligenceRequest) => {
  const symbols =
    request.stocks.length > 0
      ? request.stocks.map((stock) => stock.symbol)
      : request.deterministicSignals.flatMap((signal) =>
          signal.symbol ? [signal.symbol] : [],
        )
  return [...new Map(symbols.map((symbol) => [symbol.toUpperCase(), symbol])).values()]
}

const canonicalSymbol = (value: unknown, symbols: Map<string, string>) => {
  if (typeof value !== 'string') {
    throw new Error('Model returned an out-of-set symbol.')
  }
  const symbol = symbols.get(value.trim().toUpperCase())
  if (!symbol) {
    throw new Error('Model returned an out-of-set symbol.')
  }
  return symbol
}

const validateAttachment = (
  evidence: GroundedEvidence[],
  symbol: string,
) => {
  if (
    evidence.some((item) => {
      const attached = item.symbol.toUpperCase()
      return attached !== symbol.toUpperCase()
    })
  ) {
    throw new Error('Model returned misattached evidence IDs.')
  }
  return evidence
}

const normalizeWatchlistOutput = (
  value: unknown,
  request: WatchlistIntelligenceRequest,
): WatchlistIntelligenceOutput => {
  const record = asRecord(value)
  const summaryRecord = asRecord(
    pick(record, ['summary', 'Summary']),
  )
  const evidence = requestEvidence(request)
  const catalog = createEvidenceCatalog(evidence)
  const symbols = new Map(
    suppliedSymbols(request).map((symbol) => [symbol.toUpperCase(), symbol]),
  )
  const rawSummary = pick(record, [
    'summary',
    'Summary',
    'overallSummary',
    'overall_summary',
    'overallThesisEvidenceSummary',
    'overall_thesis_evidence_summary',
    'overview',
  ])
  const summary =
    typeof rawSummary === 'string' && rawSummary.trim()
      ? rawSummary.trim()
      : typeof pick(summaryRecord, [
            'summary',
            'overallSummary',
            'overall_summary',
          ]) === 'string'
        ? String(
            pick(summaryRecord, [
              'summary',
              'overallSummary',
              'overall_summary',
            ]),
          ).trim()
        : 'Phi assessed the supplied watchlist evidence. Review each grounded stock assessment below.'

  const prioritized = catalog.resolveIds(
    pick(record, [
      'priorityEvidenceIds',
      'PriorityEvidenceIds',
      'prioritizedEvidenceIds',
      'prioritizedSignalIds',
      'priority_order',
      'order',
    ]) ??
      pick(summaryRecord, [
        'priorityEvidenceIds',
        'prioritizedEvidenceIds',
        'prioritizedSignalIds',
      ]),
    { max: 75 },
  )
  const rawAssessmentsFromKeys = Object.entries(record)
    .filter(([symbol, assessment]) => {
      const isSupplied = symbols.has(symbol.toUpperCase())
      return (
        isSupplied &&
        typeof assessment === 'object' &&
        assessment !== null
      )
    })
    .map(([symbol, assessment]) => ({
      symbol,
      ...asRecord(assessment),
    }))
  const rawAssessments =
    pick(record, ['assessments', 'Assessments']) ??
    pick(summaryRecord, ['assessments', 'Assessments']) ??
    rawAssessmentsFromKeys
  if (!Array.isArray(rawAssessments)) {
    throw new Error('Model returned invalid watchlist assessments.')
  }

  const assessments = rawAssessments.map((rawAssessment) => {
    const assessment = asRecord(rawAssessment)
    const symbol = canonicalSymbol(
      pick(assessment, ['symbol', 'Symbol', 'ticker']),
      symbols,
    )
    const score = normalizeScore(
      pick(assessment, ['score', 'Score', 'thesisEvidenceScore']),
    )
    const opinion = normalizeOpinion(
      pick(assessment, ['opinion', 'Opinion']),
      score,
    )
    const stock = request.stocks.find(
      (candidate) =>
        candidate.symbol.toUpperCase() === symbol.toUpperCase(),
    )
    const strengthIds = pick(assessment, [
      'strengthEvidenceIds',
      'StrengthEvidenceIds',
      'strengths',
      'evidenceIds',
    ])
    const riskIds = pick(assessment, [
      'riskEvidenceIds',
      'RiskEvidenceIds',
      'risks',
      'evidenceIds',
    ])
    const strengths = validateAttachment(
      catalog.resolveIds(
        Array.isArray(strengthIds) && strengthIds.length === 0
          ? [stock?.evidence[0]?.id]
          : strengthIds ?? [stock?.evidence[0]?.id],
        { min: 1, max: 16 },
      ).slice(0, 3),
      symbol,
    )
    const risks = validateAttachment(
      catalog.resolveIds(
        Array.isArray(riskIds) && riskIds.length === 0
          ? [stock?.evidence.at(-1)?.id]
          : riskIds ?? [stock?.evidence.at(-1)?.id],
        { min: 1, max: 16 },
      ).slice(0, 3),
      symbol,
    )
    const assessmentSummary = pick(assessment, [
      'summary',
      'Summary',
      'assessment',
    ])
    if (typeof assessmentSummary === 'string') {
      assertNoProhibitedAdvice([assessmentSummary])
    }
    const normalizedAssessmentSummary = `${strengths[0].text} Key uncertainty: ${risks[0].text}`

    assertNoProhibitedAdvice([normalizedAssessmentSummary])
    assertNoInventedNumericClaims(normalizedAssessmentSummary, [
      ...strengths,
      ...risks,
    ])

    return {
      symbol,
      score,
      opinion,
      summary: normalizedAssessmentSummary,
      strengths: strengths.map((item) => ({
        evidenceId: item.id,
        text: item.text,
      })),
      risks: risks.map((item) => ({
        evidenceId: item.id,
        text: item.text,
      })),
      confidence: normalizeConfidence(
        pick(assessment, ['confidence', 'Confidence']),
      ),
    }
  })

  const assessmentSymbols = assessments.map((item) => item.symbol.toUpperCase())
  if (
    assessments.length !== symbols.size ||
    new Set(assessmentSymbols).size !== symbols.size ||
    [...symbols.keys()].some((symbol) => !assessmentSymbols.includes(symbol))
  ) {
    throw new Error('Model must assess every supplied watchlist stock once.')
  }

  const rawPatterns =
    pick(record, [
      'crossStockPatterns',
      'CrossStockPatterns',
      'patterns',
      'experimentalPatterns',
      'cross_signals',
    ]) ??
    pick(summaryRecord, [
      'crossStockPatterns',
      'patterns',
      'experimentalPatterns',
      'cross_signals',
    ]) ??
    []
  if (!Array.isArray(rawPatterns)) {
    throw new Error('Model returned invalid cross-stock patterns.')
  }

  const experimentalPatterns = rawPatterns.map((rawPattern) => {
    const pattern = asRecord(rawPattern)
    const patternEvidence = catalog.resolveIds(
      pick(pattern, [
        'evidenceIds',
        'EvidenceIds',
        'evidence_ids',
        'signal_ids',
        'signals',
      ]),
      { min: 2, max: 8 },
    )
    const distinctSymbols = new Set(
      patternEvidence
        .map((item) => item.symbol.toUpperCase())
        .filter((symbol) => symbol !== 'WATCHLIST'),
    )
    if (distinctSymbols.size < 2) {
      throw new Error(
        'Cross-stock patterns require evidence from distinct symbols.',
      )
    }
    const title =
      pick(pattern, ['title', 'Title', 'label']) ??
      'Verified evidence may connect these watchlist items'
    const explanation =
      pick(pattern, ['explanation', 'Explanation', 'relationship']) ??
      patternEvidence.map((item) => item.text).join(' ')
    const thesisRelationship =
      pick(pattern, [
        'thesisRelationship',
        'ThesisRelationship',
        'thesis_relationship',
      ]) ??
      'Review how this shared evidence affects the supplied thesis.'
    if (
      typeof title !== 'string' ||
      typeof explanation !== 'string' ||
      typeof thesisRelationship !== 'string'
    ) {
      throw new Error('Model returned an invalid cross-stock narrative.')
    }

    assertNoProhibitedAdvice([title, explanation, thesisRelationship])
    assertNoInventedNumericClaims(explanation, patternEvidence)
    assertNoInventedNumericClaims(thesisRelationship, patternEvidence)

    return {
      title: title.trim(),
      explanation: explanation.trim(),
      evidenceIds: patternEvidence.map((item) => item.id),
      confidence: normalizeConfidence(
        pick(pattern, ['confidence', 'Confidence']),
      ),
      thesisRelationship: thesisRelationship.trim(),
    }
  })

  const rawUncertainties =
    pick(record, ['uncertainties', 'Uncertainties']) ??
    pick(summaryRecord, ['uncertainties', 'Uncertainties']) ??
    []
  const uncertainties = Array.isArray(rawUncertainties)
    ? rawUncertainties.filter(
        (item): item is string => typeof item === 'string',
      )
    : []
  assertNoProhibitedAdvice([summary, ...uncertainties])
  assertNoInventedNumericClaims(summary, evidence)
  uncertainties.forEach((item) => assertNoInventedNumericClaims(item, evidence))

  const signalIds = new Set(
    request.deterministicSignals.map((signal) => signal.id),
  )
  const prioritizedEvidenceIds = prioritized.map((item) => item.id)
  const output = {
    prioritizedSignalIds: prioritizedEvidenceIds.filter((id) =>
      signalIds.has(id),
    ),
    prioritizedEvidenceIds,
    summary,
    assessments,
    experimentalPatterns,
    crossStockPatterns: experimentalPatterns,
    uncertainties,
  }
  return watchlistIntelligenceResponseSchema.parse(output)
}

export const generateWatchlistIntelligence = async (
  request: WatchlistIntelligenceRequest,
  clientId: string,
): Promise<WatchlistIntelligenceOutput> => {
  const symbols = suppliedSymbols(request)
  const evidence = requestEvidence(request)
  if (evidence.length === 0) {
    return {
      prioritizedSignalIds: [],
      prioritizedEvidenceIds: [],
      summary: 'No verified watchlist evidence was supplied for review.',
      assessments: [],
      experimentalPatterns: [],
      crossStockPatterns: [],
      uncertainties: [],
    }
  }

  const catalog = createEvidenceCatalog(evidence)
  return callGroundedModel({
    operation: 'watchlist',
    request,
    clientId,
    maxTokens: 1600,
    systemPrompt:
      'Review every supplied watchlist stock using only supplied evidence aliases. Include stable stocks. Prioritize business evidence over price movement. Select evidence; the server maps user-facing prose. Do not give trade instructions or predict returns.',
    userPrompt: `Thesis: ${request.thesis.style}; ${request.thesis.horizon}; ${request.thesis.risk}; sectors ${request.thesis.sectors.join(', ')}
${request.thesis.note ? `Optional thesis note: ${request.thesis.note}\n` : ''}Watchlist symbols: ${symbols.join(', ')}
Evidence:
${catalog.lines.join('\n')}
Return priorityEvidenceIds, assessments, crossStockPatterns, uncertainties. Assess every supplied symbol exactly once with symbol, score, opinion, strengthEvidenceIds, riskEvidenceIds, confidence. Score MUST be an integer from 0 to 100, never a 0-5 or 0-10 scale: about 80 means strongly supportive with manageable risks, about 50 means genuinely mixed, and about 20 means evidence materially contradicts the thesis. Opinion must be Compelling, Promising but mixed, Watch closely, or Reconsider. Cross-stock patterns need only evidenceIds and confidence, with at least two distinct evidence IDs from distinct symbols. Stable evidence is valid; priorityEvidenceIds may be empty. Keep JSON compact.`,
    normalize: (value) => normalizeWatchlistOutput(value, request),
  })
}
