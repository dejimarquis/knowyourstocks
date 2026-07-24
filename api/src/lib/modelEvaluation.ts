import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import {
  modelEvalDataset,
  type ModelEvalFixture,
} from './eval/modelEvalFixtures'

const opinionSchema = z.enum([
  'Compelling',
  'Promising but mixed',
  'Watch closely',
  'Reconsider',
])
const confidenceSchema = z.enum(['low', 'medium', 'high'])
const evidenceListSchema = z.array(z.string()).max(8)

const researchSchema = z.object({
  score: z.number().int().min(0).max(100),
  opinion: opinionSchema,
  summary: z.string().max(300),
  strengthEvidenceIds: evidenceListSchema,
  riskEvidenceIds: evidenceListSchema,
  confidence: confidenceSchema,
})

const recommendationSchema = z.object({
  rankedSymbols: z.array(z.string()).length(5),
  rationales: z.array(
    z.object({
      symbol: z.string(),
      evidenceIds: evidenceListSchema.min(1),
    }),
  ).length(5),
})

const watchlistSchema = z.object({
  summary: z.string().max(300),
  priorityEvidenceIds: evidenceListSchema,
  assessments: z.array(
    z.object({
      symbol: z.string(),
      score: z.number().int().min(0).max(100),
      opinion: opinionSchema,
      evidenceIds: evidenceListSchema.min(1),
      confidence: confidenceSchema,
    }),
  ),
})

const outputSchemas = {
  research: researchSchema,
  recommendations: recommendationSchema,
  watchlist: watchlistSchema,
} as const

const prohibitedAdvice =
  /\b(buy|sell|hold|short|purchase|exit|overweight|underweight|price\s+target|guarante(?:e|ed|es))\b/i

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const normalizeEvidenceId = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return `e${value}`
  }

  if (typeof value !== 'string') {
    return null
  }

  return /^\d+$/.test(value) ? `e${value}` : value
}

const normalizeEvidenceIds = (value: unknown) => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = normalizeEvidenceId(value)
    return id ? [id] : []
  }

  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .map(normalizeEvidenceId)
          .filter((id): id is string => id != null),
      ),
    ]
  }

  const record = asRecord(value)
  return [
    ...new Set(
      Object.keys(record)
        .map(normalizeEvidenceId)
        .filter((id): id is string => id != null),
    ),
  ]
}

const normalizeScore = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  if (value >= 0 && value <= 1) {
    return Math.round(value * 100)
  }

  if (value > 1 && value <= 10) {
    return Math.round(value * 10)
  }

  return Math.round(Math.min(100, Math.max(0, value)))
}

const normalizeConfidence = (value: unknown) => {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }

  const score = normalizeScore(value)
  return score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
}

const normalizeOpinion = (value: unknown, score: number) => {
  if (
    value === 'Compelling' ||
    value === 'Promising but mixed' ||
    value === 'Watch closely' ||
    value === 'Reconsider'
  ) {
    return value
  }

  return score >= 75
    ? 'Compelling'
    : score >= 55
      ? 'Promising but mixed'
      : score >= 35
        ? 'Watch closely'
        : 'Reconsider'
}

const normalizeOutput = (fixture: ModelEvalFixture, value: unknown) => {
  const record = asRecord(value)

  if (fixture.operation === 'research') {
    const score = normalizeScore(record.score)
    return {
      score,
      opinion: normalizeOpinion(record.opinion, score),
      summary:
        typeof record.summary === 'string' ? record.summary : '',
      strengthEvidenceIds: normalizeEvidenceIds(
        record.strengthEvidenceIds ?? record.strengths ?? record.strength,
      ),
      riskEvidenceIds: normalizeEvidenceIds(
        record.riskEvidenceIds ?? record.risks ?? record.risk,
      ),
      confidence: normalizeConfidence(record.confidence),
    }
  }

  if (fixture.operation === 'recommendations') {
    const rankedSymbols =
      record.rankedSymbols ?? record.RankedSymbols ?? record.order ?? []
    const rawRationales =
      record.rationales ?? record.Rationales ?? []

    return {
      rankedSymbols: Array.isArray(rankedSymbols)
        ? rankedSymbols.filter(
            (symbol): symbol is string => typeof symbol === 'string',
          )
        : [],
      rationales: Array.isArray(rawRationales)
        ? rawRationales.map((value) => {
            const rationale = asRecord(value)
            const symbol =
              typeof rationale.symbol === 'string'
                ? rationale.symbol
                : Object.keys(rationale).find((key) =>
                    fixture.candidates.includes(key),
                  ) ?? ''
            return {
              symbol,
              evidenceIds: normalizeEvidenceIds(
                rationale.evidenceIds ?? rationale[symbol],
              ),
            }
          })
        : [],
    }
  }

  const summaryRecord = asRecord(record.summary)
  const nestedAssessments = summaryRecord.assessments
  const rawAssessments = Array.isArray(record.assessments)
    ? record.assessments
    : Array.isArray(nestedAssessments)
      ? nestedAssessments
      : Object.entries(summaryRecord)
          .filter(([symbol]) => fixture.symbols.includes(symbol))
          .map(([symbol, assessment]) => ({
            symbol,
            ...asRecord(assessment),
          }))

  return {
    summary:
      typeof record.summary === 'string'
        ? record.summary
        : 'Per-stock watchlist assessment completed.',
    priorityEvidenceIds: normalizeEvidenceIds(
      record.priorityEvidenceIds ?? summaryRecord.priorityEvidenceIds,
    ),
    assessments: rawAssessments.map((value) => {
      const assessment = asRecord(value)
      const score = normalizeScore(assessment.score)
      return {
        symbol:
          typeof assessment.symbol === 'string' ? assessment.symbol : '',
        score,
        opinion: normalizeOpinion(assessment.opinion, score),
        evidenceIds: normalizeEvidenceIds(assessment.evidenceIds),
        confidence: normalizeConfidence(assessment.confidence),
      }
    }),
  }
}

const promptFor = (fixture: ModelEvalFixture) => {
  const evidence = fixture.evidence
    .map((item) => `${item.id} | ${item.symbol} | ${item.fact}`)
    .join('\n')
  const common = `Thesis: ${fixture.thesis}
Evidence:
${evidence}
Use only supplied evidence IDs. Do not invent facts, numbers, or symbols. Do not give Buy/Hold/Sell instructions. Return concise JSON only.`

  if (fixture.operation === 'research') {
    return `${common}
Assess ${fixture.symbol}. Return keys score, opinion, summary, strengthEvidenceIds, riskEvidenceIds, confidence.
Opinion must be one of Compelling, Promising but mixed, Watch closely, Reconsider.
The score measures thesis-evidence strength, not future returns.`
  }

  if (fixture.operation === 'recommendations') {
    return `${common}
Candidates: ${fixture.candidates.join(', ')}
Rank exactly five supplied candidates. Return keys rankedSymbols and rationales. Each rationale has symbol and evidenceIds.`
  }

  return `${common}
Watchlist symbols: ${fixture.symbols.join(', ')}
Assess every supplied symbol, including stable ones. Return keys summary, priorityEvidenceIds, assessments. Each assessment has symbol, score, opinion, evidenceIds, confidence.`
}

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export type ModelEvalResult = {
  fixtureId: string
  operation: ModelEvalFixture['operation']
  deployment: string
  score: number
  hardFailures: string[]
  latencyMs: number
  usage: Usage
  responsePreview?: string
}

const validateCommon = (fixture: ModelEvalFixture, value: unknown) => {
  const allowedEvidence = new Set(fixture.evidence.map((item) => item.id))
  const text = JSON.stringify(value)
  const failures: string[] = []

  if (prohibitedAdvice.test(text)) {
    failures.push('prohibited advice language')
  }

  return { allowedEvidence, failures }
}

const scoreOutput = (fixture: ModelEvalFixture, value: unknown) => {
  const schema = outputSchemas[fixture.operation]
  const parsed = schema.safeParse(normalizeOutput(fixture, value))

  if (!parsed.success) {
    return { score: 0, hardFailures: ['invalid operation schema'] }
  }

  const { allowedEvidence, failures } = validateCommon(fixture, parsed.data)
  const evidenceById = new Map(
    fixture.evidence.map((item) => [item.id, item]),
  )
  let grounding = 40
  let taskAccuracy = 25
  let missingData = 15
  let calibration = 10

  if (fixture.operation === 'research') {
    const output = researchSchema.parse(parsed.data)
    const evidenceIds = [
      ...output.strengthEvidenceIds,
      ...output.riskEvidenceIds,
    ]
    const unknown = evidenceIds.filter((id) => !allowedEvidence.has(id))

    if (unknown.length > 0) {
      failures.push('unknown evidence IDs')
    }
    if (
      evidenceIds.some(
        (id) => evidenceById.get(id)?.symbol !== fixture.symbol,
      )
    ) {
      failures.push('misattached evidence IDs')
    }
    const required = fixture.expected.requiredEvidenceIds.filter(
      (id) => !evidenceIds.includes(id),
    )
    grounding -= required.length * 10
    const [minimum, maximum] = fixture.expected.scoreBand
    if (output.score < minimum || output.score > maximum) {
      taskAccuracy -= 15
    }
    if (!fixture.expected.opinions.includes(output.opinion)) {
      taskAccuracy -= 10
    }
    if (
      fixture.expected.confidence &&
      output.confidence !== fixture.expected.confidence
    ) {
      calibration -= 5
    }
    if (
      fixture.id === 'research-incomplete' &&
      !output.riskEvidenceIds.includes('e3')
    ) {
      missingData = 0
    }
  } else if (fixture.operation === 'recommendations') {
    const output = recommendationSchema.parse(parsed.data)
    const candidateSet = new Set(fixture.candidates)
    const unknownSymbols = output.rankedSymbols.filter(
      (symbol) => !candidateSet.has(symbol),
    )
    if (unknownSymbols.length > 0) {
      failures.push('out-of-set symbols')
    }
    const evidenceIds = output.rationales.flatMap((item) => item.evidenceIds)
    if (evidenceIds.some((id) => !allowedEvidence.has(id))) {
      failures.push('unknown evidence IDs')
    }
    if (
      output.rationales.some((rationale) =>
        rationale.evidenceIds.some(
          (id) => evidenceById.get(id)?.symbol !== rationale.symbol,
        ),
      )
    ) {
      failures.push('misattached evidence IDs')
    }
    const topHits = fixture.expected.topSymbols.filter((symbol) =>
      output.rankedSymbols.slice(0, 3).includes(symbol),
    ).length
    taskAccuracy -=
      (fixture.expected.topSymbols.length - topHits) * 8
    if (
      fixture.expected.omittedSymbols.some((symbol) =>
        output.rankedSymbols.includes(symbol),
      )
    ) {
      taskAccuracy -= 10
    }
    missingData = 15
    calibration = 10
  } else {
    const output = watchlistSchema.parse(parsed.data)
    const assessmentSymbols = new Set(
      output.assessments.map((item) => item.symbol),
    )
    const expectedSymbols = new Set(fixture.expected.assessmentSymbols)
    if (
      [...assessmentSymbols].some((symbol) => !expectedSymbols.has(symbol))
    ) {
      failures.push('out-of-set symbols')
    }
    const evidenceIds = [
      ...output.priorityEvidenceIds,
      ...output.assessments.flatMap((item) => item.evidenceIds),
    ]
    if (evidenceIds.some((id) => !allowedEvidence.has(id))) {
      failures.push('unknown evidence IDs')
    }
    if (
      output.assessments.some((assessment) =>
        assessment.evidenceIds.some((id) => {
          const symbol = evidenceById.get(id)?.symbol
          return symbol !== assessment.symbol && symbol !== 'watchlist'
        }),
      )
    ) {
      failures.push('misattached evidence IDs')
    }
    const missingSymbols = fixture.expected.assessmentSymbols.filter(
      (symbol) => !assessmentSymbols.has(symbol),
    )
    taskAccuracy -= missingSymbols.length * 5
    const priorityHits = fixture.expected.priorityEvidenceIds.filter((id) =>
      output.priorityEvidenceIds.includes(id),
    ).length
    grounding -=
      (fixture.expected.priorityEvidenceIds.length - priorityHits) * 10
    if (
      fixture.id === 'watchlist-stable' &&
      output.priorityEvidenceIds.length > 0
    ) {
      calibration -= 10
    }
  }

  if (failures.length > 0) {
    return { score: 0, hardFailures: failures }
  }

  return {
    score: Math.max(
      0,
      grounding + taskAccuracy + missingData + calibration,
    ),
    hardFailures: failures,
  }
}

export const evaluateDeployment = async (
  endpoint: string,
  key: string,
  deployment: string,
  fixtureIds?: Set<string>,
  delayMs = 20_000,
): Promise<ModelEvalResult[]> => {
  const results: ModelEvalResult[] = []
  const fixtures = fixtureIds
    ? modelEvalDataset.fixtures.filter((fixture) =>
        fixtureIds.has(fixture.id),
      )
    : modelEvalDataset.fixtures

  for (const [index, fixture] of fixtures.entries()) {
    const startedAt = performance.now()
    let usage: Usage = {}
    let responsePreview: string | undefined

    try {
      let response: Response | null = null

      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(
          `${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(45_000),
            headers: {
              'Content-Type': 'application/json',
              'api-key': key,
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content:
                    'You are a grounded investment-research evaluator. Return JSON only and never reveal chain-of-thought.',
                },
                { role: 'user', content: promptFor(fixture) },
              ],
              temperature: 0,
              max_tokens: 700,
              response_format: { type: 'json_object' },
            }),
          },
        )

        if (response.status !== 429 || attempt === 2) {
          break
        }

        const retryAfter = Number(response.headers.get('Retry-After'))
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : delayMs,
          ),
        )
      }

      if (!response?.ok) {
        throw new Error(`HTTP ${response?.status ?? 'unknown'}`)
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: Usage
      }
      usage = body.usage ?? {}
      const content = body.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('empty response')
      }

      responsePreview = content.slice(0, 1000)
      const scored = scoreOutput(fixture, JSON.parse(content))
      results.push({
        fixtureId: fixture.id,
        operation: fixture.operation,
        deployment,
        score: scored.score,
        hardFailures: scored.hardFailures,
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
        ...(scored.hardFailures.length > 0 ? { responsePreview } : {}),
      })
    } catch (error) {
      results.push({
        fixtureId: fixture.id,
        operation: fixture.operation,
        deployment,
        score: 0,
        hardFailures: [
          error instanceof Error ? error.message : 'evaluation failed',
        ],
        latencyMs: Math.round(performance.now() - startedAt),
        usage,
        ...(responsePreview ? { responsePreview } : {}),
      })
    }

    if (index < fixtures.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return results
}

export const summarizeEvaluation = (results: ModelEvalResult[]) => {
  const byDeployment = new Map<string, ModelEvalResult[]>()

  results.forEach((result) => {
    const values = byDeployment.get(result.deployment) ?? []
    values.push(result)
    byDeployment.set(result.deployment, values)
  })

  return [...byDeployment.entries()].map(([deployment, values]) => {
    const sortedLatency = values
      .map((value) => value.latencyMs)
      .sort((left, right) => left - right)
    const p95Index = Math.max(
      0,
      Math.ceil(sortedLatency.length * 0.95) - 1,
    )

    return {
      deployment,
      averageScore:
        values.reduce((sum, value) => sum + value.score, 0) /
        values.length,
      validResponses: values.filter(
        (value) => value.hardFailures.length === 0,
      ).length,
      totalResponses: values.length,
      medianLatencyMs:
        sortedLatency[Math.floor(sortedLatency.length / 2)] ?? 0,
      p95LatencyMs: sortedLatency[p95Index] ?? 0,
      promptTokens: values.reduce(
        (sum, value) => sum + (value.usage.prompt_tokens ?? 0),
        0,
      ),
      completionTokens: values.reduce(
        (sum, value) => sum + (value.usage.completion_tokens ?? 0),
        0,
      ),
      failures: values.flatMap((value) =>
        value.hardFailures.map((failure) => ({
          fixtureId: value.fixtureId,
          failure,
        })),
      ),
    }
  })
}
