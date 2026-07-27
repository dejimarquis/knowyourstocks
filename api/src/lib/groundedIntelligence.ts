import { createHash } from 'node:crypto'
import { z } from 'zod'

export const opinionLabels = [
  'Fits thesis',
  'Mixed',
  'Weak fit',
  'Insufficient evidence',
] as const

export const opinionSchema = z.enum(opinionLabels)
export const confidenceSchema = z.enum(['low', 'medium', 'high'])

export const thesisSchema = z
  .object({
    sectors: z.array(z.string().min(1).max(80)).max(4),
    horizon: z.string().min(1).max(40),
    risk: z.string().min(1).max(40),
    style: z.string().min(1).max(40),
    note: z.string().max(500).optional(),
  })
  .strict()

export const metricProvenanceSchema = z
  .object({
    source: z.enum(['Alpha Vantage', 'Finnhub', 'SEC EDGAR']),
    asOf: z.string().nullable(),
    period: z.string().max(80),
  })
  .strict()

export const compactSnapshotSchema = z
  .object({
    earningsGrowth: z.number().nullable().optional(),
    operatingMargin: z.number().nullable().optional(),
    freeCashFlow: z.number().nullable().optional(),
    debtToEquity: z.number().nullable().optional(),
    currentRatio: z.number().nullable().optional(),
    metricProvenance: z
      .record(z.string(), metricProvenanceSchema)
      .optional()
      .default({}),
  })
  .strict()

export const groundedEvidenceSchema = z
  .object({
    id: z.string().min(1).max(180),
    symbol: z.string().min(1).max(16),
    text: z.string().min(1).max(500),
  })
  .strict()

export type GroundedEvidence = z.infer<typeof groundedEvidenceSchema>

export const prohibitedAdvice =
  /\b(buy|sell|hold|short(?![-\s]+term\b)|purchase|exit|overweight|underweight|avoid|go\s+long|go\s+short|price\s+target|target\s+price|guarante(?:e|ed|es)|risk[-\s]?free|strong\s+buy|strong\s+sell|enter\s+(?:a\s+)?position|close\s+(?:the|your|a)\s+position)\b/i

const cacheLifetimeMs = 6 * 60 * 60 * 1000
const dailyWindowMs = 24 * 60 * 60 * 1000
const maximumAttemptTimeoutMs = 20_000
const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
let globalWindowStartedAt = Date.now()
let globalCalls = 0
const clientCalls = new Map<string, { windowStartedAt: number; count: number }>()

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export type IntelligenceOperation =
  | 'research'
  | 'recommendations'
  | 'watchlist'

const deploymentSettings: Record<
  IntelligenceOperation,
  { environmentKey: string; defaultDeployment: string }
> = {
  research: {
    environmentKey: 'FOUNDRY_RESEARCH_DEPLOYMENT',
    defaultDeployment: 'gpt-5-mini-intelligence',
  },
  recommendations: {
    environmentKey: 'FOUNDRY_RECOMMENDATION_DEPLOYMENT',
    defaultDeployment: 'gpt-5-mini-intelligence',
  },
  watchlist: {
    environmentKey: 'FOUNDRY_WATCHLIST_DEPLOYMENT',
    defaultDeployment: 'gpt-oss-120b-intelligence',
  },
}

export const getFoundrySettings = (
  operation: IntelligenceOperation = 'research',
) => {
  const deployment = deploymentSettings[operation]
  return {
    endpoint: process.env.FOUNDRY_OPENAI_ENDPOINT,
    key: process.env.FOUNDRY_API_KEY,
    deployment:
      process.env[deployment.environmentKey] ??
      process.env.FOUNDRY_DEPLOYMENT ??
      deployment.defaultDeployment,
    timeoutMs: Math.min(
      positiveInteger(process.env.FOUNDRY_TIMEOUT_MS, maximumAttemptTimeoutMs),
      maximumAttemptTimeoutMs,
    ),
    maxDailyCalls: positiveInteger(process.env.FOUNDRY_MAX_DAILY_CALLS, 500),
    maxClientDailyCalls: positiveInteger(
      process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS,
      10,
    ),
  }
}

export class IntelligenceRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'IntelligenceRequestError'
  }
}

export const parseIntelligenceRequestBody = <T>(
  schema: z.ZodType<T>,
  value: unknown,
): T => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new IntelligenceRequestError('Invalid intelligence request.', {
      cause: parsed.error,
    })
  }
  return parsed.data
}

const rateLimit = (clientId: string, operation: IntelligenceOperation) => {
  const now = Date.now()
  const settings = getFoundrySettings(operation)

  if (now - globalWindowStartedAt >= dailyWindowMs) {
    globalWindowStartedAt = now
    globalCalls = 0
  }
  if (globalCalls >= settings.maxDailyCalls) {
    throw new Error('The daily intelligence budget has been reached.')
  }

  const previous = clientCalls.get(clientId)
  const client =
    !previous || now - previous.windowStartedAt >= dailyWindowMs
      ? { windowStartedAt: now, count: 0 }
      : previous

  if (client.count >= settings.maxClientDailyCalls) {
    throw new Error('The daily intelligence limit for this browser was reached.')
  }

  globalCalls += 1
  client.count += 1
  clientCalls.set(clientId, client)
}

const parseRetryAfterMs = (response: Response) => {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, 500)
    : 50
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const transientStatus = (status: number) => status === 429 || status >= 500

export const parseModelJson = (content: string): unknown => {
  const trimmed = content.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const candidates: Array<{ length: number; value: unknown }> = []
  for (let start = 0; start < unfenced.length; start += 1) {
    if (unfenced[start] !== '{') continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < unfenced.length; index += 1) {
      const character = unfenced[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (character === '\\') {
          escaped = true
        } else if (character === '"') {
          inString = false
        }
        continue
      }
      if (character === '"') {
        inString = true
      } else if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            candidates.push({
              length: index + 1 - start,
              value: JSON.parse(unfenced.slice(start, index + 1)),
            })
          } catch {
            // Continue looking for a later complete object.
          }
          break
        }
      }
    }
  }

  const largest = candidates.sort((left, right) => right.length - left.length)[0]
  if (largest) return largest.value

  throw new Error('Foundry returned invalid JSON output.')
}

export const assertNoProhibitedAdvice = (narratives: string[]) => {
  if (narratives.some((text) => prohibitedAdvice.test(text))) {
    throw new Error('Model returned prohibited investment advice language.')
  }
}

export const assertNoNumericNarrative = (narratives: string[]) => {
  const numericValue =
    /\d|\b(?:hundred|thousand|million|billion|trillion|half|quarter|twice|double|doubled|triple|tripled|percent|percentage)\b/i
  if (narratives.some((text) => numericValue.test(text))) {
    throw new Error(
      'Model returned digits or numeric values in generated narrative text.',
    )
  }
}

const numericClaims = (text: string) =>
  [...text.matchAll(/[-+]?\$?\d[\d,]*(?:\.\d+)?%?/g)].map((match) => {
    const raw = match[0]
    const numeric = Number(raw.replace(/[$,%]/g, ''))
    return Number.isFinite(numeric) ? numeric : raw
  })

export const assertNoInventedNumericClaims = (
  narrative: string,
  evidence: GroundedEvidence[],
) => {
  const allowed = new Set(
    evidence.flatMap((item) => numericClaims(item.text)).map(String),
  )
  const invented = numericClaims(narrative).filter(
    (claim) => !allowed.has(String(claim)),
  )

  if (invented.length > 0) {
    throw new Error('Model returned an invented numeric claim.')
  }
}

export const normalizeScore = (value: unknown) => {
  const score =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('Model returned an invalid thesis-evidence score.')
  }
  return Math.round(score <= 1 ? score * 100 : score <= 10 ? score * 10 : score)
}

export const normalizeOpinion = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new Error('Model returned an unsupported opinion label.')
  }
  const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const opinion = opinionLabels.find(
    (label) => label.toLowerCase() === normalized.toLowerCase(),
  )
  if (!opinion) {
    throw new Error('Model returned an unsupported opinion label.')
  }
  return opinion
}

export const normalizeConfidence = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new Error('Model returned an unsupported confidence level.')
  }
  const normalized = value.trim().toLowerCase()
  if (normalized !== 'low' && normalized !== 'medium' && normalized !== 'high') {
    throw new Error('Model returned an unsupported confidence level.')
  }
  return normalized
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export const pick = (
  record: Record<string, unknown>,
  keys: string[],
): unknown => {
  for (const key of keys) {
    if (key in record) return record[key]
  }
  return undefined
}

export type EvidenceCatalog = ReturnType<typeof createEvidenceCatalog>

export const createEvidenceCatalog = (evidence: GroundedEvidence[]) => {
  const aliases = new Map<string, GroundedEvidence>()
  const originals = new Map<string, GroundedEvidence>()

  evidence.forEach((item, index) => {
    aliases.set(`e${index + 1}`, item)
    originals.set(item.id.toLowerCase(), item)
  })

  const resolveOne = (value: unknown) => {
    const candidate =
      typeof value === 'number' && Number.isInteger(value)
        ? `e${value}`
        : typeof value === 'string'
          ? /^\d+$/.test(value.trim())
            ? `e${value.trim()}`
            : value.trim()
          : ''
    const resolved =
      aliases.get(candidate.toLowerCase()) ??
      originals.get(candidate.toLowerCase())
    if (!resolved) throw new Error('Model returned an unknown evidence ID.')
    return resolved
  }

  const resolveIds = (
    value: unknown,
    options: { min?: number; max?: number; rejectDuplicates?: boolean } = {},
  ) => {
    const raw = Array.isArray(value) ? value : value == null ? [] : [value]
    const resolved = raw.map(resolveOne)
    const ids = resolved.map((item) => item.id)
    if (
      options.rejectDuplicates !== false &&
      new Set(ids).size !== ids.length
    ) {
      throw new Error('Model returned duplicate relationship evidence.')
    }
    if (options.min != null && ids.length < options.min) {
      throw new Error('Model returned insufficient evidence.')
    }
    if (options.max != null && ids.length > options.max) {
      throw new Error('Model returned too much evidence.')
    }
    return resolved
  }

  return {
    lines: [...aliases.entries()].map(
      ([alias, item]) => `${alias} (${item.id}) | ${item.symbol} | ${item.text}`,
    ),
    resolveIds,
  }
}

export const mappedCitationSchema = z
  .object({
    evidenceId: z.string(),
    symbol: z.string(),
    text: z.string(),
  })
  .strict()

export const mapCitations = (evidence: GroundedEvidence[]) =>
  evidence.map((item) => ({
    evidenceId: item.id,
    symbol: item.symbol,
    text: item.text,
  }))

export type JsonSchema = Record<string, unknown>

type ModelCallOptions<T> = {
  operation: IntelligenceOperation
  request: unknown
  clientId: string
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  attemptTimeoutMs?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  responseSchema?: { name: string; schema: JsonSchema }
  normalize: (value: unknown) => T
}

type FoundryBody = {
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string
      refusal?: string
    }
  }>
}

class NonRetryableFoundryError extends Error {}

const requestBody = (
  options: ModelCallOptions<unknown>,
  deployment: string,
) => {
  const common = {
    messages: [
      {
        role: 'system',
        content: `${options.systemPrompt} Generated narrative text must contain no digits and no number words; express magnitude qualitatively because numbers appear only in evidence text that the server maps through citations. Return only the requested concise JSON. Never reveal hidden chain-of-thought; provide only a short reasoning summary grounded in citations.`,
      },
      { role: 'user', content: options.userPrompt },
    ],
  }
  if (options.responseSchema) {
    return {
      ...common,
      max_completion_tokens: options.maxTokens,
      ...(options.reasoningEffort &&
      deployment.toLowerCase().includes('gpt-5')
        ? { reasoning_effort: options.reasoningEffort }
        : {}),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.responseSchema.name,
          strict: true,
          schema: options.responseSchema.schema,
        },
      },
    }
  }
  if (!deployment.toLowerCase().includes('phi')) {
    throw new Error('Strict JSON schema is required for this deployment.')
  }
  return {
    ...common,
    temperature: 0,
    max_tokens: options.maxTokens,
    response_format: { type: 'json_object' },
  }
}

export const callGroundedModel = async <T>(
  options: ModelCallOptions<T>,
): Promise<T> => {
  const settings = getFoundrySettings(options.operation)
  if (!settings.endpoint || !settings.key) {
    throw new Error('Model intelligence is not configured.')
  }

  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        deployment: settings.deployment,
        operation: options.operation,
        responseSchema: options.responseSchema?.name ?? 'legacy-json',
        request: options.request,
      }),
    )
    .digest('hex')
  const cached = responseCache.get(requestHash)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T

  rateLimit(options.clientId, options.operation)
  const url = `${settings.endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(settings.deployment)}/chat/completions?api-version=2024-10-21`
  const body = requestBody(options, settings.deployment)
  const timeoutMs = Math.min(
    settings.timeoutMs,
    options.attemptTimeoutMs ?? settings.timeoutMs,
    maximumAttemptTimeoutMs,
  )
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          'api-key': settings.key,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errorPayload = (await response
          .clone()
          .json()
          .catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null
        const detail = [
          errorPayload?.error?.code,
          errorPayload?.error?.message,
        ]
          .filter(Boolean)
          .join(': ')
          .slice(0, 500)
        const error = new Error(
          `Foundry returned HTTP ${response.status}${detail ? `: ${detail}` : ''}.`,
        )
        if (attempt === 0 && transientStatus(response.status)) {
          await wait(parseRetryAfterMs(response))
          lastError = error
          continue
        }
        throw transientStatus(response.status)
          ? error
          : new NonRetryableFoundryError(error.message)
      }

      const payload = (await response.clone().json()) as FoundryBody
      const choice = payload.choices?.[0]
      if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
        throw new Error('Foundry refused the intelligence request.')
      }
      const content = choice?.message?.content
      if (!content) throw new Error('Foundry returned no intelligence output.')

      const normalized = options.normalize(parseModelJson(content))
      responseCache.set(requestHash, {
        expiresAt: Date.now() + cacheLifetimeMs,
        value: normalized,
      })
      return normalized
    } catch (error) {
      lastError = error
      if (attempt === 0 && !(error instanceof NonRetryableFoundryError)) {
        await wait(50)
        continue
      }
      break
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Foundry returned invalid intelligence output.')
}

export const intelligenceErrorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : ''
  if (
    message.includes('limit') ||
    message.includes('budget') ||
    message.includes('quota') ||
    message.includes('HTTP 429')
  ) {
    return 429
  }
  if (error instanceof IntelligenceRequestError || error instanceof SyntaxError) {
    return 400
  }
  return 503
}

export const intelligenceErrorResponse = (error: unknown) => {
  const status = intelligenceErrorStatus(error)
  const sourceMessage =
    error instanceof Error ? error.message : 'Intelligence request failed.'
  if (status === 400) {
    return {
      status,
      jsonBody: {
        error: 'Invalid intelligence request.',
        code: 'INVALID_REQUEST',
        retryable: false,
      },
    }
  }
  if (status === 429) {
    return {
      status,
      jsonBody: {
        error: sourceMessage,
        code: 'INTELLIGENCE_LIMIT_REACHED',
        retryable: true,
      },
    }
  }
  return {
    status,
    jsonBody: {
      error: 'Intelligence is temporarily unavailable.',
      code: 'INTELLIGENCE_UNAVAILABLE',
      retryable: true,
    },
  }
}

export const resetGroundedIntelligenceStateForTests = () => {
  responseCache.clear()
  clientCalls.clear()
  globalCalls = 0
  globalWindowStartedAt = Date.now()
}
