import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import {
  modelEvalDataset,
  type ModelEvalFixture,
} from './eval/modelEvalFixtures'
import {
  assertNoNumericNarrative,
  assertNoProhibitedAdvice,
  confidenceSchema,
  opinionSchema,
  parseModelJson,
  type JsonSchema,
} from './groundedIntelligence'

const claimSchema = z
  .object({
    text: z.string().min(1).max(360),
    citationIds: z.array(z.string()).min(1).max(5),
  })
  .strict()

const researchSchema = z
  .object({
    opinion: opinionSchema,
    headline: z.string().min(1).max(140),
    reasoningSummary: claimSchema,
    whyItFits: z.array(claimSchema).min(1).max(4),
    concerns: z.array(claimSchema).min(1).max(4),
    whatToWatchNext: z.array(claimSchema).min(1).max(4),
    confidence: confidenceSchema,
    uncertainty: claimSchema,
  })
  .strict()

const recommendationSchema = z
  .object({
    rankings: z
      .array(
        z
          .object({
            symbol: z.string(),
            opinion: opinionSchema,
            thesisRationale: z.string().min(1).max(300),
            mainConcern: z.string().min(1).max(240),
            whatToResearchNext: z.string().min(1).max(240),
            confidence: confidenceSchema,
            citationIds: z.array(z.string()).min(1).max(5),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()

const watchlistSchema = z
  .object({
    overallOpinion: opinionSchema,
    overallSummary: z
      .object({
        text: z.string().min(1).max(180),
        citationIds: z.array(z.string()).min(1).max(2),
      })
      .strict(),
    prioritizedEvidenceIds: z.array(z.string()).max(8),
    stocks: z
      .array(
        z
          .object({
            symbol: z.string(),
            opinion: opinionSchema,
            whatChanged: z
              .object({
                text: z.string().min(1).max(180),
                citationIds: z.array(z.string()).min(1).max(2),
              })
              .strict(),
            whyItFits: z.array(claimSchema).min(1).max(1),
            concerns: z.array(claimSchema).min(1).max(1),
            whatToWatchNext: z.array(claimSchema).min(1).max(1),
            confidence: confidenceSchema,
          })
          .strict(),
      )
      .min(1)
      .max(25),
    crossStockPatterns: z
      .array(
        z
          .object({
            title: z.string().min(1).max(100),
            summary: z.string().min(1).max(180),
            citationIds: z.array(z.string()).min(2).max(4),
            confidence: confidenceSchema,
          })
          .strict(),
      )
      .max(1),
  })
  .strict()

const outputSchemas = {
  research: researchSchema,
  recommendations: recommendationSchema,
  watchlist: watchlistSchema,
} as const

const citationArrayJsonSchema = (
  citationIds: string[],
  minItems = 1,
  maxItems = 5,
) => ({
  type: 'array',
  minItems,
  maxItems,
  items: { type: 'string', enum: citationIds },
})

const boundedStringJsonSchema = (maxLength: number) => ({
  type: 'string',
  minLength: 1,
  maxLength,
})

const claimJsonSchema = (citationIds: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['text', 'citationIds'],
  properties: {
    text: boundedStringJsonSchema(360),
    citationIds: citationArrayJsonSchema(citationIds, 1, 5),
  },
})

export const jsonSchemaForFixture = (
  fixture: ModelEvalFixture,
): JsonSchema => {
  const citationIds = fixture.evidence.map((item) => item.id)
  const claim = claimJsonSchema(citationIds)
  const watchlistClaim = {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'citationIds'],
    properties: {
      text: boundedStringJsonSchema(180),
      citationIds: citationArrayJsonSchema(citationIds, 1, 2),
    },
  }

  if (fixture.operation === 'research') {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'opinion',
        'headline',
        'reasoningSummary',
        'whyItFits',
        'concerns',
        'whatToWatchNext',
        'confidence',
        'uncertainty',
      ],
      properties: {
        opinion: { type: 'string', enum: opinionSchema.options },
        headline: boundedStringJsonSchema(140),
        reasoningSummary: { $ref: '#/$defs/claim' },
        whyItFits: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { $ref: '#/$defs/claim' },
        },
        concerns: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { $ref: '#/$defs/claim' },
        },
        whatToWatchNext: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { $ref: '#/$defs/claim' },
        },
        confidence: { type: 'string', enum: confidenceSchema.options },
        uncertainty: { $ref: '#/$defs/claim' },
      },
      $defs: { claim },
    }
  }

  if (fixture.operation === 'recommendations') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['rankings'],
      properties: {
        rankings: {
          type: 'array',
          minItems: fixture.candidates.length,
          maxItems: fixture.candidates.length,
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
              symbol: { type: 'string', enum: fixture.candidates },
              opinion: { type: 'string', enum: opinionSchema.options },
              thesisRationale: boundedStringJsonSchema(300),
              mainConcern: boundedStringJsonSchema(240),
              whatToResearchNext: boundedStringJsonSchema(240),
              confidence: { type: 'string', enum: confidenceSchema.options },
              citationIds: citationArrayJsonSchema(citationIds),
            },
          },
        },
      },
    }
  }

  return {
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
      overallSummary: { $ref: '#/$defs/watchlistClaim' },
      prioritizedEvidenceIds: citationArrayJsonSchema(citationIds, 0, 8),
      stocks: {
        type: 'array',
        minItems: fixture.symbols.length,
        maxItems: fixture.symbols.length,
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
            symbol: { type: 'string', enum: fixture.symbols },
            opinion: { type: 'string', enum: opinionSchema.options },
            whatChanged: { $ref: '#/$defs/watchlistClaim' },
            whyItFits: {
              type: 'array',
              minItems: 1,
              maxItems: 1,
              items: { $ref: '#/$defs/watchlistClaim' },
            },
            concerns: {
              type: 'array',
              minItems: 1,
              maxItems: 1,
              items: { $ref: '#/$defs/watchlistClaim' },
            },
            whatToWatchNext: {
              type: 'array',
              minItems: 1,
              maxItems: 1,
              items: { $ref: '#/$defs/watchlistClaim' },
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
            title: boundedStringJsonSchema(100),
            summary: boundedStringJsonSchema(180),
            citationIds: citationArrayJsonSchema(citationIds, 2, 4),
            confidence: { type: 'string', enum: confidenceSchema.options },
          },
        },
      },
    },
    $defs: { claim, watchlistClaim },
  }
}

const promptFor = (fixture: ModelEvalFixture) => {
  const evidence = fixture.evidence
    .map((item) => `${item.id} | ${item.symbol} | ${item.fact}`)
    .join('\n')
  const common = `Thesis: ${fixture.thesis}
Evidence:
${evidence}
Use only supplied evidence IDs. Every factual narrative must be concise and cited. Narrative text must contain no digits and no number words; express magnitude qualitatively because citations carry the numeric evidence. Do not invent facts or symbols. Do not give trade instructions, targets, guarantees, predictions, or scores.`

  if (fixture.operation === 'research') {
    return `${common}
Assess ${fixture.symbol}. Return opinion, headline, reasoningSummary, whyItFits, concerns, whatToWatchNext, confidence, and uncertainty. Treat the headline as a non-numeric label; every other narrative must be in a claim object with citations.`
  }
  if (fixture.operation === 'recommendations') {
    return `${common}
Candidates: ${fixture.candidates.join(', ')}
Rank every supplied candidate exactly once. Each ranking requires symbol, opinion, thesisRationale, mainConcern, whatToResearchNext, confidence, and citationIds belonging only to that symbol. The citationIds must support all three narratives in that ranking.`
  }
  return `${common}
Watchlist symbols: ${fixture.symbols.join(', ')}
Assess every supplied symbol exactly once, including stable stocks. Return overallOpinion, overallSummary, prioritizedEvidenceIds, stocks, and at most one optional crossStockPattern. Prioritize only material changes or active risks; return no prioritizedEvidenceIds when every stock is stable. Use exact "No material change" for stable stocks. Each stock must contain exactly one concise whyItFits claim, one concise concern, and one concise whatToWatchNext claim. Each stock claim must cite evidence belonging only to that stock.`
}

export type ModelUsage = {
  promptTokens: number
  completionTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
}

export const opinionDeployments = [
  'gpt-5-mini-intelligence',
  'gpt-oss-120b-intelligence',
] as const

export type OpinionDeployment = (typeof opinionDeployments)[number]

export type RubricScores = {
  groundedness: number
  relevance: number
  completeness: number
  usefulness: number
}

export type HardGates = {
  strictSchema: boolean
  citations: boolean
  symbols: boolean
  safety: boolean
  digitFreeNarrative: boolean
  narrativeCitations: boolean
  inclusion: boolean
}

export type ModelEvalResult = {
  sampleId: string
  fixtureId: string
  repetition: number
  operation: ModelEvalFixture['operation']
  deployment: OpinionDeployment
  outcome: 'success' | 'refusal' | 'error'
  latencyMs: number
  usage: ModelUsage
  rubric: RubricScores
  averageRubric: number
  hardGates: HardGates
  hardFailures: string[]
  qualityIssues: string[]
  droppedOptionalPatterns: number
  response?: unknown
  refusal?: string
  error?: string
}

const emptyUsage = (): ModelUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
})

const failedGates = (): HardGates => ({
  strictSchema: false,
  citations: false,
  symbols: false,
  safety: false,
  digitFreeNarrative: false,
  narrativeCitations: false,
  inclusion: false,
})

const failingRubric = (): RubricScores => ({
  groundedness: 1,
  relevance: 1,
  completeness: 1,
  usefulness: 1,
})

const averageRubric = (rubric: RubricScores) =>
  Object.values(rubric).reduce((sum, value) => sum + value, 0) /
  Object.keys(rubric).length

const evidenceMap = (fixture: ModelEvalFixture) =>
  new Map(fixture.evidence.map((item) => [item.id, item]))

const addFailure = (failures: string[], failure: string) => {
  if (!failures.includes(failure)) failures.push(failure)
}

const checkNarrative = (
  text: string,
  citationIds: string[],
  fixture: ModelEvalFixture,
  expectedSymbol: string | undefined,
  failures: string[],
  gates: HardGates,
) => {
  if (citationIds.length === 0) {
    gates.narrativeCitations = false
    addFailure(failures, 'uncited narrative claim')
    return
  }
  const byId = evidenceMap(fixture)
  const citations = citationIds
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => item != null)
  if (citations.length !== citationIds.length) {
    gates.citations = false
    addFailure(failures, 'unknown citation')
  }
  if (
    expectedSymbol &&
    citations.some(
      (item) => item.symbol.toUpperCase() !== expectedSymbol.toUpperCase(),
    )
  ) {
    gates.citations = false
    addFailure(failures, 'misattached citation')
  }
  try {
    assertNoProhibitedAdvice([text])
  } catch {
    gates.safety = false
    addFailure(failures, 'direct trade instruction, target, or guarantee')
  }
  try {
    assertNoNumericNarrative([text])
  } catch {
    gates.digitFreeNarrative = false
    addFailure(failures, 'numeric value in narrative text')
  }
}

const coverageScore = (covered: number, total: number) => {
  if (total === 0 || covered === total) return 5
  const ratio = covered / total
  if (ratio >= 0.75) return 4
  if (ratio >= 0.5) return 3
  if (ratio > 0) return 2
  return 1
}

const uniqueNarratives = (narratives: string[]) =>
  new Set(narratives.map((text) => text.trim().toLowerCase())).size ===
  narratives.length

export const evaluateModelOutput = (
  fixture: ModelEvalFixture,
  value: unknown,
): Pick<
  ModelEvalResult,
  | 'rubric'
  | 'averageRubric'
  | 'hardGates'
  | 'hardFailures'
  | 'qualityIssues'
  | 'droppedOptionalPatterns'
> => {
  const parsed = outputSchemas[fixture.operation].safeParse(value)
  if (!parsed.success) {
    const rubric = failingRubric()
    return {
      rubric,
      averageRubric: averageRubric(rubric),
      hardGates: failedGates(),
      hardFailures: ['invalid strict schema or extra keys'],
      qualityIssues: [],
      droppedOptionalPatterns: 0,
    }
  }

  const failures: string[] = []
  const qualityIssues: string[] = []
  let droppedOptionalPatterns = 0
  const gates: HardGates = {
    strictSchema: true,
    citations: true,
    symbols: true,
    safety: true,
    digitFreeNarrative: true,
    narrativeCitations: true,
    inclusion: true,
  }
  let relevance = 5
  let completeness = 5
  let usefulness = 5

  if (fixture.operation === 'research') {
    const output = researchSchema.parse(parsed.data)
    try {
      assertNoProhibitedAdvice([output.headline])
    } catch {
      gates.safety = false
      addFailure(failures, 'direct trade instruction, target, or guarantee')
    }
    try {
      assertNoNumericNarrative([output.headline])
    } catch {
      gates.digitFreeNarrative = false
      addFailure(failures, 'numeric value in narrative text')
    }
    const claims = [
      output.reasoningSummary,
      ...output.whyItFits,
      ...output.concerns,
      ...output.whatToWatchNext,
      output.uncertainty,
    ]
    claims.forEach((claim) =>
      checkNarrative(
        claim.text,
        claim.citationIds,
        fixture,
        fixture.symbol,
        failures,
        gates,
      ),
    )
    const citedIds = new Set(claims.flatMap((claim) => claim.citationIds))
    const covered = fixture.expected.requiredEvidenceIds.filter((id) =>
      citedIds.has(id),
    ).length
    relevance = coverageScore(covered, fixture.expected.requiredEvidenceIds.length)
    if (!fixture.expected.opinions.includes(output.opinion)) {
      relevance = Math.max(1, relevance - 2)
    }
    completeness =
      covered === fixture.expected.requiredEvidenceIds.length
        ? 5
        : coverageScore(covered, fixture.expected.requiredEvidenceIds.length)
    const narratives = claims.map((claim) => claim.text)
    usefulness =
      output.whyItFits.length > 0 &&
      output.concerns.length > 0 &&
      output.whatToWatchNext.length > 0 &&
      uniqueNarratives(narratives)
        ? 5
        : 3
  } else if (fixture.operation === 'recommendations') {
    const output = recommendationSchema.parse(parsed.data)
    const candidateSet = new Set(fixture.candidates)
    const symbols = output.rankings.map((ranking) => ranking.symbol)
    if (symbols.some((symbol) => !candidateSet.has(symbol))) {
      gates.symbols = false
      addFailure(failures, 'out-of-set symbol')
    }
    if (
      symbols.length !== fixture.candidates.length ||
      new Set(symbols).size !== symbols.length ||
      fixture.candidates.some((symbol) => !symbols.includes(symbol))
    ) {
      gates.inclusion = false
      addFailure(failures, 'candidate not included exactly once')
    }
    output.rankings.forEach((ranking) => {
      const narratives = [
        ranking.thesisRationale,
        ranking.mainConcern,
        ranking.whatToResearchNext,
      ]
      narratives.forEach((text) =>
        checkNarrative(
          text,
          ranking.citationIds,
          fixture,
          ranking.symbol,
          failures,
          gates,
        ),
      )
      if (!uniqueNarratives(narratives)) usefulness = Math.min(usefulness, 3)
    })
    const topWindow = symbols.slice(0, fixture.expected.topSymbols.length)
    const bottomWindow = symbols.slice(-fixture.expected.bottomSymbols.length)
    const topCovered = fixture.expected.topSymbols.filter((symbol) =>
      topWindow.includes(symbol),
    ).length
    const bottomCovered = fixture.expected.bottomSymbols.filter((symbol) =>
      bottomWindow.includes(symbol),
    ).length
    relevance = coverageScore(
      topCovered + bottomCovered,
      fixture.expected.topSymbols.length +
        fixture.expected.bottomSymbols.length,
    )
    completeness = gates.inclusion ? 5 : 1
  } else {
    const output = watchlistSchema.parse(parsed.data)
    const symbolSet = new Set(fixture.symbols)
    const symbols = output.stocks.map((stock) => stock.symbol)
    if (symbols.some((symbol) => !symbolSet.has(symbol))) {
      gates.symbols = false
      addFailure(failures, 'out-of-set symbol')
    }
    if (
      symbols.length !== fixture.symbols.length ||
      new Set(symbols).size !== symbols.length ||
      fixture.symbols.some((symbol) => !symbols.includes(symbol))
    ) {
      gates.inclusion = false
      addFailure(failures, 'watchlist stock not included exactly once')
    }
    checkNarrative(
      output.overallSummary.text,
      output.overallSummary.citationIds,
      fixture,
      undefined,
      failures,
      gates,
    )
    output.stocks.forEach((stock) => {
      const claims = [
        stock.whatChanged,
        ...stock.whyItFits,
        ...stock.concerns,
        ...stock.whatToWatchNext,
      ]
      claims.forEach((claim) =>
        checkNarrative(
          claim.text,
          claim.citationIds,
          fixture,
          stock.symbol,
          failures,
          gates,
        ),
      )
      if (!fixture.expected.opinions[stock.symbol]?.includes(stock.opinion)) {
        relevance = Math.min(relevance, 3)
      }
      if (!uniqueNarratives(claims.map((claim) => claim.text))) {
        usefulness = Math.min(usefulness, 3)
      }
    })
    output.prioritizedEvidenceIds.forEach((id) => {
      if (!evidenceMap(fixture).has(id)) {
        gates.citations = false
        addFailure(failures, 'unknown prioritized citation')
      }
    })
    output.crossStockPatterns.forEach((pattern, index) => {
      const patternFailures: string[] = []
      const patternGates: HardGates = {
        strictSchema: true,
        citations: true,
        symbols: true,
        safety: true,
        digitFreeNarrative: true,
        narrativeCitations: true,
        inclusion: true,
      }
      checkNarrative(
        `${pattern.title}. ${pattern.summary}`,
        pattern.citationIds,
        fixture,
        undefined,
        patternFailures,
        patternGates,
      )
      const symbolsInPattern = new Set(
        pattern.citationIds
          .map((id) => evidenceMap(fixture).get(id)?.symbol)
          .filter((symbol): symbol is string => symbol != null),
      )
      if (symbolsInPattern.size < 2) {
        patternGates.citations = false
        addFailure(
          patternFailures,
          'cross-stock pattern lacks distinct symbols',
        )
      }
      if (!Object.values(patternGates).every(Boolean)) {
        droppedOptionalPatterns += 1
        qualityIssues.push(
          `dropped optional cross-stock pattern ${index + 1}: ${patternFailures.join(', ')}`,
        )
        usefulness = Math.min(usefulness, 4)
      }
    })
    const priorityCovered = fixture.expected.priorityEvidenceIds.filter((id) =>
      output.prioritizedEvidenceIds.includes(id),
    ).length
    relevance = Math.min(
      relevance,
      coverageScore(
        priorityCovered,
        fixture.expected.priorityEvidenceIds.length,
      ),
    )
    const stableCorrect = fixture.expected.stableSymbols.filter((symbol) => {
      const stock = output.stocks.find((item) => item.symbol === symbol)
      return stock?.whatChanged.text === 'No material change'
    }).length
    if (stableCorrect !== fixture.expected.stableSymbols.length) {
      relevance = Math.min(relevance, 3)
    }
    if (
      fixture.expected.priorityEvidenceIds.length === 0 &&
      output.prioritizedEvidenceIds.length > 0
    ) {
      relevance = Math.min(relevance, 3)
    }
    completeness = gates.inclusion ? 5 : 1
  }

  const hardPass = Object.values(gates).every(Boolean)
  const rubric: RubricScores = {
    groundedness: hardPass ? 5 : 1,
    relevance,
    completeness,
    usefulness,
  }
  return {
    rubric,
    averageRubric: averageRubric(rubric),
    hardGates: gates,
    hardFailures: failures,
    qualityIssues,
    droppedOptionalPatterns,
  }
}

type RawUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number }
  input_tokens?: number
  output_tokens?: number
  output_tokens_details?: { reasoning_tokens?: number }
}

const normalizeUsage = (usage: RawUsage | undefined): ModelUsage => {
  const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? 0
  const completionTokens =
    usage?.completion_tokens ?? usage?.output_tokens ?? 0
  const reasoningTokens =
    usage?.completion_tokens_details?.reasoning_tokens ??
    usage?.output_tokens_details?.reasoning_tokens ??
    0
  return {
    promptTokens,
    completionTokens,
    outputTokens: Math.max(0, completionTokens - reasoningTokens),
    reasoningTokens,
    totalTokens:
      usage?.total_tokens ?? promptTokens + completionTokens,
  }
}

const timeoutFor = (_operation: ModelEvalFixture['operation']) => 20_000

export type EvaluationRepetitions = Record<
  ModelEvalFixture['operation'],
  number
>

export type EvaluationRunOptions = {
  fixtureIds?: Set<string>
  repetitions?: Partial<EvaluationRepetitions>
  concurrency?: number
  delayMs?: number
}

export const selectedOpinionRouting = {
  research: 'gpt-5-mini-intelligence',
  recommendations: 'gpt-5-mini-intelligence',
  watchlist: 'gpt-oss-120b-intelligence',
} as const satisfies Record<
  ModelEvalFixture['operation'],
  OpinionDeployment
>

const positiveCount = (value: number | undefined, fallback: number) =>
  Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback

const evaluateOne = async (
  endpoint: string,
  key: string,
  deployment: OpinionDeployment,
  fixture: ModelEvalFixture,
  repetition: number,
): Promise<ModelEvalResult> => {
  const startedAt = performance.now()
  let usage = emptyUsage()
  const sampleId = `${deployment}:${fixture.id}:${repetition}`
  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutFor(fixture.operation)),
        headers: {
          'Content-Type': 'application/json',
          'api-key': key,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are a grounded investment-research evaluator. Return only strict JSON. Provide concise conclusions, not hidden chain-of-thought. Opinions are research labels, never trade instructions.',
            },
            { role: 'user', content: promptFor(fixture) },
          ],
          max_completion_tokens:
            fixture.operation === 'research'
              ? 1_600
              : fixture.operation === 'recommendations'
                ? 2_200
                : 1_400,
          reasoning_effort: 'low',
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: `${fixture.operation}_opinion_eval`,
              strict: true,
              schema: jsonSchemaForFixture(fixture),
            },
          },
        }),
      },
    )
    const body = (await response.json()) as {
      error?: { message?: string }
      choices?: Array<{
        finish_reason?: string
        message?: {
          content?: string
          refusal?: string
          reasoning_content?: unknown
        }
      }>
      usage?: RawUsage
    }
    usage = normalizeUsage(body.usage)
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}${body.error?.message ? `: ${body.error.message}` : ''}`,
      )
    }
    const choice = body.choices?.[0]
    const refusal = choice?.message?.refusal
    if (refusal || choice?.finish_reason === 'content_filter') {
      return {
        sampleId,
        fixtureId: fixture.id,
        repetition,
        operation: fixture.operation,
        deployment,
        outcome: 'refusal',
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
        rubric: failingRubric(),
        averageRubric: 1,
        hardGates: failedGates(),
        hardFailures: ['model refusal'],
        qualityIssues: [],
        droppedOptionalPatterns: 0,
        refusal: refusal ?? 'content_filter',
      }
    }

    const content = choice?.message?.content
    if (!content) throw new Error('empty model response')
    const parsed = parseModelJson(content)
    const evaluated = evaluateModelOutput(fixture, parsed)
    return {
      sampleId,
      fixtureId: fixture.id,
      repetition,
      operation: fixture.operation,
      deployment,
      outcome: 'success',
      latencyMs: Math.round(performance.now() - startedAt),
      usage,
      ...evaluated,
      response: parsed,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'evaluation failed'
    return {
      sampleId,
      fixtureId: fixture.id,
      repetition,
      operation: fixture.operation,
      deployment,
      outcome: 'error',
      latencyMs: Math.round(performance.now() - startedAt),
      usage,
      rubric: failingRubric(),
      averageRubric: 1,
      hardGates: failedGates(),
      hardFailures: [message],
      qualityIssues: [],
      droppedOptionalPatterns: 0,
      error: message,
    }
  }
}

export const evaluateDeployment = async (
  endpoint: string,
  key: string,
  deployment: string,
  options: EvaluationRunOptions = {},
): Promise<ModelEvalResult[]> => {
  if (!opinionDeployments.includes(deployment as OpinionDeployment)) {
    throw new Error(`Unsupported opinion evaluation deployment: ${deployment}`)
  }
  const selectedDeployment = deployment as OpinionDeployment
  const fixtures = options.fixtureIds
    ? modelEvalDataset.fixtures.filter((fixture) =>
        options.fixtureIds!.has(fixture.id),
      )
    : modelEvalDataset.fixtures
  const repetitions: EvaluationRepetitions = {
    research: positiveCount(options.repetitions?.research, 1),
    recommendations: positiveCount(options.repetitions?.recommendations, 1),
    watchlist: positiveCount(options.repetitions?.watchlist, 1),
  }
  const jobs = fixtures.flatMap((fixture) =>
    Array.from(
      { length: repetitions[fixture.operation] },
      (_, repetition) => ({ fixture, repetition: repetition + 1 }),
    ),
  )
  const concurrency = Math.min(
    8,
    positiveCount(options.concurrency, 1),
  )
  const delayMs =
    Number.isFinite(options.delayMs) && (options.delayMs ?? 0) >= 0
      ? options.delayMs!
      : 2_000
  const indexedResults: Array<{ index: number; result: ModelEvalResult }> = []
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      const job = jobs[index]
      if (!job) return
      const result = await evaluateOne(
        endpoint,
        key,
        selectedDeployment,
        job.fixture,
        job.repetition,
      )
      indexedResults.push({ index, result })
      if (delayMs > 0 && index < jobs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return indexedResults
    .sort((left, right) => left.index - right.index)
    .map((item) => item.result)
}

export const evaluateSelectedRouting = async (
  endpoint: string,
  key: string,
  options: EvaluationRunOptions = {},
) => {
  const results: ModelEvalResult[] = []
  for (const operation of [
    'research',
    'recommendations',
    'watchlist',
  ] as const) {
    const fixtureIds = new Set(
      modelEvalDataset.fixtures
        .filter(
          (fixture) =>
            fixture.operation === operation &&
            (!options.fixtureIds || options.fixtureIds.has(fixture.id)),
        )
        .map((fixture) => fixture.id),
    )
    if (fixtureIds.size === 0) continue
    results.push(
      ...(await evaluateDeployment(
        endpoint,
        key,
        selectedOpinionRouting[operation],
        { ...options, fixtureIds },
      )),
    )
  }
  return results
}

const percentile95 = (values: number[]) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

const percentile50 = (values: number[]) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)] ?? 0
}

const operationThresholds = {
  research: { p95Ms: 20_000, maxMs: 20_000 },
  recommendations: { p95Ms: 20_000, maxMs: 20_000 },
  watchlist: { p95Ms: 20_000, maxMs: 20_000 },
} as const

export const publicTokenPricing = {
  source:
    'Public Azure calculator/catalog pricing supplied for this evaluation; not a contractual quote.',
  perMillionTokens: {
    'gpt-5-mini-intelligence': { inputUsd: 0.25, outputUsd: 2 },
    'gpt-oss-120b-intelligence': { inputUsd: 0.15, outputUsd: 0.6 },
  },
} as const

const estimatedCost = (values: ModelEvalResult[]) => {
  const totalUsd = values.reduce((sum, value) => {
    const pricing = publicTokenPricing.perMillionTokens[value.deployment]
    return (
      sum +
      (value.usage.promptTokens / 1_000_000) * pricing.inputUsd +
      (value.usage.completionTokens / 1_000_000) * pricing.outputUsd
    )
  }, 0)
  return {
    totalUsd,
    perCallUsd: totalUsd / Math.max(1, values.length),
    billedOutputTokens: values.reduce(
      (sum, value) => sum + value.usage.completionTokens,
      0,
    ),
    note: publicTokenPricing.source,
  }
}

const summarizeResults = (
  values: ModelEvalResult[],
  operation?: ModelEvalFixture['operation'],
) => {
  const latencies = values.map((value) => value.latencyMs)
  const fixtureAverages = values.map((value) => value.averageRubric)
  const dimensionValues = values.flatMap((value) => Object.values(value.rubric))
  const hardPasses = values.filter((value) =>
    Object.values(value.hardGates).every(Boolean),
  ).length
  const generatedResponses = values.filter(
    (value) => value.outcome === 'success',
  ).length
  const groundingPasses = values.filter(
    (value) =>
      value.hardGates.citations &&
      value.hardGates.digitFreeNarrative &&
      value.hardGates.narrativeCitations,
  ).length
  const rubricAverage =
    fixtureAverages.reduce((sum, value) => sum + value, 0) /
    Math.max(1, fixtureAverages.length)
  const qualityGate =
    rubricAverage >= 4 &&
    (dimensionValues.length === 0 || Math.min(...dimensionValues) >= 3)
  const hardGate =
    values.length > 0 &&
    hardPasses === values.length &&
    groundingPasses === values.length
  const threshold = operation ? operationThresholds[operation] : undefined
  const observedP95Ms = percentile95(latencies)
  const observedMaxMs = latencies.length === 0 ? 0 : Math.max(...latencies)
  const p95Stable = values.length >= 20
  const latencyGate = !threshold
    ? 'not-applicable'
    : observedP95Ms > threshold.p95Ms || observedMaxMs > threshold.maxMs
      ? 'fail'
      : p95Stable
        ? 'pass'
        : 'insufficient-sample'

  return {
    sampleSize: values.length,
    rubric: {
      average: rubricAverage,
      dimensions: {
        groundedness:
          values.reduce(
            (sum, value) => sum + value.rubric.groundedness,
            0,
          ) / Math.max(1, values.length),
        relevance:
          values.reduce((sum, value) => sum + value.rubric.relevance, 0) /
          Math.max(1, values.length),
        completeness:
          values.reduce(
            (sum, value) => sum + value.rubric.completeness,
            0,
          ) / Math.max(1, values.length),
        usefulness:
          values.reduce((sum, value) => sum + value.rubric.usefulness, 0) /
          Math.max(1, values.length),
      },
      minimumFixtureAverage:
        fixtureAverages.length === 0 ? 0 : Math.min(...fixtureAverages),
      minimumDimension:
        dimensionValues.length === 0 ? 0 : Math.min(...dimensionValues),
      qualityGate,
    },
    hardGates: {
      passed: hardPasses,
      passRate: values.length === 0 ? 0 : hardPasses / values.length,
      generatedResponses,
      passedAmongGenerated: hardPasses,
      passRateAmongGenerated:
        generatedResponses === 0 ? 0 : hardPasses / generatedResponses,
      groundingPassed: groundingPasses,
      groundingPassRate:
        values.length === 0 ? 0 : groundingPasses / values.length,
      strictSchemaPassed: values.filter(
        (value) => value.hardGates.strictSchema,
      ).length,
      strictSchemaPassRateAmongGenerated:
        generatedResponses === 0
          ? 0
          : values.filter((value) => value.hardGates.strictSchema).length /
            generatedResponses,
      generatedCoreGate:
        generatedResponses > 0 &&
        hardPasses === generatedResponses &&
        groundingPasses === generatedResponses,
      hardGate,
    },
    latency: {
      p50Ms: percentile50(latencies),
      p95Ms: observedP95Ms,
      maxMs: observedMaxMs,
      p95Stable,
      p95SampleMinimum: 20,
      ...(threshold ? { thresholds: threshold } : {}),
      gate: latencyGate,
    },
    tokens: {
      prompt: values.reduce(
        (sum, value) => sum + value.usage.promptTokens,
        0,
      ),
      completion: values.reduce(
        (sum, value) => sum + value.usage.completionTokens,
        0,
      ),
      output: values.reduce(
        (sum, value) => sum + value.usage.outputTokens,
        0,
      ),
      reasoning: values.reduce(
        (sum, value) => sum + value.usage.reasoningTokens,
        0,
      ),
      total: values.reduce((sum, value) => sum + value.usage.totalTokens, 0),
      perSample: {
        prompt:
          values.reduce(
            (sum, value) => sum + value.usage.promptTokens,
            0,
          ) / Math.max(1, values.length),
        output:
          values.reduce(
            (sum, value) => sum + value.usage.outputTokens,
            0,
          ) / Math.max(1, values.length),
        reasoning:
          values.reduce(
            (sum, value) => sum + value.usage.reasoningTokens,
            0,
          ) / Math.max(1, values.length),
        total:
          values.reduce((sum, value) => sum + value.usage.totalTokens, 0) /
          Math.max(1, values.length),
      },
      rubricPointsPer1kTokens:
        rubricAverage /
        Math.max(
          0.001,
          values.reduce((sum, value) => sum + value.usage.totalTokens, 0) /
            Math.max(1, values.length) /
            1_000,
        ),
    },
    estimatedCost: estimatedCost(values),
    refusals: values.filter((value) => value.outcome === 'refusal').length,
    errors: values.filter((value) => value.outcome === 'error').length,
    droppedOptionalPatterns: values.reduce(
      (sum, value) => sum + value.droppedOptionalPatterns,
      0,
    ),
    qualityIssues: values.flatMap((value) =>
      value.qualityIssues.map((issue) => ({
        sampleId: value.sampleId,
        fixtureId: value.fixtureId,
        repetition: value.repetition,
        issue,
      })),
    ),
    failures: values.flatMap((value) =>
      value.hardFailures.map((failure) => ({
        sampleId: value.sampleId,
        fixtureId: value.fixtureId,
        repetition: value.repetition,
        failure,
      })),
    ),
  }
}

const summarizeDeployment = (results: ModelEvalResult[]) => {
  const operations = {
    research: summarizeResults(
      results.filter((result) => result.operation === 'research'),
      'research',
    ),
    discover: summarizeResults(
      results.filter((result) => result.operation === 'recommendations'),
      'recommendations',
    ),
    watchlist: summarizeResults(
      results.filter((result) => result.operation === 'watchlist'),
      'watchlist',
    ),
  }
  const overall = summarizeResults(results)
  const testedOperations = Object.values(operations).filter(
    (operation) => operation.sampleSize > 0,
  )
  const allQuality = testedOperations.every(
    (operation) => operation.rubric.qualityGate,
  )
  const allHardGates = testedOperations.every(
    (operation) => operation.hardGates.hardGate,
  )
  const latencyStates = testedOperations.map(
    (operation) => operation.latency.gate,
  )
  const recommendation =
    !allQuality || !allHardGates || latencyStates.includes('fail')
      ? 'do-not-ship'
      : latencyStates.includes('insufficient-sample')
        ? 'collect-more-latency-samples'
        : 'ship'

  return {
    dataset: modelEvalDataset.version,
    deployment: results[0]?.deployment,
    operations,
    overall: {
      ...overall,
      qualityGate: allQuality,
      schemaAndGroundingGate: allHardGates,
    },
    recommendation,
  }
}

const winnerScore = (summary: ReturnType<typeof summarizeDeployment>) => [
  summary.overall.hardGates.passRate,
  summary.overall.hardGates.groundingPassRate,
  summary.overall.hardGates.strictSchemaPassed /
    Math.max(1, summary.overall.sampleSize),
  summary.overall.rubric.average,
  -summary.overall.errors,
  -summary.overall.refusals,
  -summary.overall.latency.p95Ms,
  summary.overall.tokens.rubricPointsPer1kTokens,
]

const compareScores = (left: number[], right: number[]) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return (left[index] ?? 0) - (right[index] ?? 0)
  }
  return 0
}

export const modelLifecycle = {
  observedAt: '2026-07-26',
  source: 'Azure account model catalog and deployment metadata',
  deployments: {
    'gpt-5-mini-intelligence': {
      model: 'gpt-5-mini',
      version: '2025-08-07',
      lifecycleStatus: 'GenerallyAvailable',
    },
    'gpt-oss-120b-intelligence': {
      model: 'gpt-oss-120b',
      version: '1',
      lifecycleStatus: 'GenerallyAvailable',
    },
  },
  rejectedDeployment: {
    requestedModel: 'gpt-4.1-mini',
    version: '2025-04-14',
    lifecycleStatus: 'Deprecating',
    result: 'Azure rejected creation of a new deployment.',
  },
} as const

export const summarizeEvaluation = (results: ModelEvalResult[]) => {
  const models = Object.fromEntries(
    opinionDeployments
      .map((deployment) => {
        const deploymentResults = results.filter(
          (result) => result.deployment === deployment,
        )
        return deploymentResults.length > 0
          ? [deployment, summarizeDeployment(deploymentResults)]
          : undefined
      })
      .filter(
        (
          entry,
        ): entry is [
          OpinionDeployment,
          ReturnType<typeof summarizeDeployment>,
        ] => entry != null,
      ),
  ) as Partial<
    Record<OpinionDeployment, ReturnType<typeof summarizeDeployment>>
  >
  const ranked = Object.entries(models)
    .map(([deployment, summary]) => ({
      deployment: deployment as OpinionDeployment,
      summary,
      score: winnerScore(summary),
    }))
    .sort((left, right) => compareScores(right.score, left.score))
  const winner = ranked[0]
  const runnerUp = ranked[1]
  const tied =
    winner != null &&
    runnerUp != null &&
    compareScores(winner.score, runnerUp.score) === 0

  return {
    dataset: modelEvalDataset.version,
    generatedAt: new Date().toISOString(),
    lifecycle: modelLifecycle,
    models,
    comparison: {
      winner: tied ? null : (winner?.deployment ?? null),
      runnerUp: runnerUp?.deployment ?? null,
      recommendation:
        winner == null
          ? 'no-results'
          : winner.summary.recommendation === 'ship'
            ? 'winner-meets-release-gates'
            : 'winner-for-further-work-only',
      basis:
        'Combined hard-gate and grounding rates, then strict-schema reliability, rubric quality, errors/refusals, latency, and rubric points per 1,000 total tokens.',
    },
  }
}

export const summarizeSelectedRouting = (results: ModelEvalResult[]) => {
  const selected = results.filter(
    (result) =>
      result.deployment === selectedOpinionRouting[result.operation],
  )
  const operations = {
    research: {
      deployment: selectedOpinionRouting.research,
      ...summarizeResults(
        selected.filter((result) => result.operation === 'research'),
        'research',
      ),
    },
    discover: {
      deployment: selectedOpinionRouting.recommendations,
      ...summarizeResults(
        selected.filter((result) => result.operation === 'recommendations'),
        'recommendations',
      ),
    },
    watchlist: {
      deployment: selectedOpinionRouting.watchlist,
      ...summarizeResults(
        selected.filter((result) => result.operation === 'watchlist'),
        'watchlist',
      ),
    },
  }
  const operationValues = Object.values(operations)
  const qualityGate = operationValues.every(
    (operation) => operation.rubric.qualityGate,
  )
  const coreSchemaAndGroundingGate = operationValues.every(
    (operation) => operation.hardGates.hardGate,
  )
  const latencyGate = operationValues.every(
    (operation) => operation.latency.gate === 'pass',
  )
  return {
    dataset: modelEvalDataset.version,
    generatedAt: new Date().toISOString(),
    routing: selectedOpinionRouting,
    pricing: publicTokenPricing,
    operations,
    overall: {
      ...summarizeResults(selected),
      qualityGate,
      coreSchemaAndGroundingGate,
      latencyGate,
    },
    recommendation:
      qualityGate && coreSchemaAndGroundingGate && latencyGate
        ? 'ship'
        : 'no-ship',
  }
}
