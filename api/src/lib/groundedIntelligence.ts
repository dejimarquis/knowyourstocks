import { createHash } from 'node:crypto'
import { z } from 'zod'

export const opinionLabels = [
  'Compelling',
  'Promising but mixed',
  'Watch closely',
  'Reconsider',
] as const

export const opinionSchema = z.enum(opinionLabels)
export const confidenceSchema = z.enum(['low', 'medium', 'high'])

export const thesisSchema = z.object({
  sectors: z.array(z.string().min(1).max(80)).max(4),
  horizon: z.string().min(1).max(40),
  risk: z.string().min(1).max(40),
  style: z.string().min(1).max(40),
  note: z.string().max(500).optional(),
})

export const metricProvenanceSchema = z.object({
  source: z.enum(['Alpha Vantage', 'Finnhub', 'SEC EDGAR']),
  asOf: z.string().nullable(),
  period: z.string().max(80),
})

export const compactSnapshotSchema = z.object({
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

export const groundedEvidenceSchema = z.object({
  id: z.string().min(1).max(180),
  symbol: z.string().min(1).max(16),
  text: z.string().min(1).max(500),
})

export type GroundedEvidence = z.infer<typeof groundedEvidenceSchema>

export const prohibitedAdvice =
  /\b(buy|sell|hold|short|purchase|exit|overweight|underweight|avoid|go\s+long|go\s+short|price\s+target|target\s+price|guarante(?:e|ed|es)|risk[-\s]?free|strong\s+buy|strong\s+sell)\b/i

const cacheLifetimeMs = 6 * 60 * 60 * 1000
const dailyWindowMs = 24 * 60 * 60 * 1000
const responseCache = new Map<
  string,
  { expiresAt: number; value: unknown }
>()
let globalWindowStartedAt = Date.now()
let globalCalls = 0
const clientCalls = new Map<string, { windowStartedAt: number; count: number }>()

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const getFoundrySettings = () => ({
  endpoint: process.env.FOUNDRY_OPENAI_ENDPOINT,
  key: process.env.FOUNDRY_API_KEY,
  deployment: process.env.FOUNDRY_DEPLOYMENT ?? 'phi-4-mini-watchlist',
  timeoutMs: positiveInteger(process.env.FOUNDRY_TIMEOUT_MS, 25_000),
  maxDailyCalls: positiveInteger(process.env.FOUNDRY_MAX_DAILY_CALLS, 500),
  maxClientDailyCalls: positiveInteger(
    process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS,
    10,
  ),
})

const rateLimit = (clientId: string) => {
  const now = Date.now()
  const settings = getFoundrySettings()

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
    ? Math.min(seconds * 1000, 2_000)
    : 100
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const transientStatus = (status: number) => status === 429 || status >= 500

const fetchFoundry = async (
  url: string,
  key: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  maxAttempts = 2,
) => {
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          'api-key': key,
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        return response
      }

      lastError = new Error(`Foundry returned HTTP ${response.status}.`)
      if (attempt < maxAttempts - 1 && transientStatus(response.status)) {
        await wait(parseRetryAfterMs(response))
        continue
      }
      throw lastError
    } catch (error) {
      lastError = error
      const isTimeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      if (attempt < maxAttempts - 1 && isTimeout) {
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Foundry intelligence failed.')
}

export const parseModelJson = (content: string): unknown => {
  const trimmed = content.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')

  if (start < 0 || end < start) {
    throw new Error('Foundry returned invalid JSON output.')
  }

  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    throw new Error('Foundry returned invalid JSON output.')
  }
}

export const assertNoProhibitedAdvice = (narratives: string[]) => {
  if (narratives.some((text) => prohibitedAdvice.test(text))) {
    throw new Error('Model returned prohibited investment advice language.')
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

export const normalizeOpinion = (value: unknown, score?: number) => {
  const normalized =
    typeof value === 'string'
      ? value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      : ''
  const direct = opinionLabels.find(
    (label) => label.toLowerCase() === normalized.toLowerCase(),
  )

  const lower = normalized.toLowerCase()
  const recognized =
    direct ??
    (lower.includes('compelling') || lower.includes('strong support')
      ? 'Compelling'
      : lower.includes('mixed') ||
          lower.includes('neutral') ||
          lower.includes('stable')
        ? 'Promising but mixed'
        : lower.includes('watch') || lower.includes('caution')
          ? 'Watch closely'
          : lower.includes('reconsider') || lower.includes('contradict')
            ? 'Reconsider'
            : null)

  if (!recognized && normalized) {
    throw new Error('Model returned an unsupported opinion label.')
  }

  if (score != null) {
    return score >= 75
      ? 'Compelling'
      : score >= 55
        ? 'Promising but mixed'
        : score >= 35
          ? 'Watch closely'
          : 'Reconsider'
  }

  if (recognized) {
    return recognized
  }

  throw new Error('Model returned an unsupported opinion label.')
}

export const normalizeConfidence = (value: unknown) => {
  if (value == null || value === '') {
    return 'medium'
  }
  if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) {
      const score = numeric <= 1 ? numeric * 100 : numeric
      return score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
    }
  }
  if (typeof value !== 'string') {
    throw new Error('Model returned an unsupported confidence level.')
  }
  const normalized = value.trim().toLowerCase()
  if (normalized.includes('high')) return 'high'
  if (normalized.includes('medium') || normalized.includes('moderate')) {
    return 'medium'
  }
  if (
    normalized.includes('low') ||
    normalized.includes('uncertain') ||
    normalized.includes('limited')
  ) {
    return 'low'
  }
  if (
    normalized !== 'low' &&
    normalized !== 'medium' &&
    normalized !== 'high'
  ) {
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
    if (key in record) {
      return record[key]
    }
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

    if (!resolved) {
      throw new Error('Model returned an unknown evidence ID.')
    }
    return resolved
  }

  const resolveIds = (
    value: unknown,
    options: { min?: number; max?: number; rejectDuplicates?: boolean } = {},
  ) => {
    const record = asRecord(value)
    const nested =
      pick(record, ['evidenceIds', 'EvidenceIds', 'ids', 'Ids']) ??
      Object.keys(record).filter((key) => /^e?\d+$/i.test(key))
    const raw = Array.isArray(value)
      ? value
      : value == null
        ? []
        : Object.keys(record).length > 0
          ? Array.isArray(nested)
            ? nested
            : [nested]
          : [value]
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
      ([alias, item]) => `${alias} | ${item.symbol} | ${item.text}`,
    ),
    resolveIds,
  }
}

type ModelCallOptions<T> = {
  operation: 'research' | 'recommendations' | 'watchlist'
  request: unknown
  clientId: string
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  attemptTimeoutMs?: number
  regenerateInvalidOutput?: boolean
  retryTransient?: boolean
  normalize: (value: unknown) => T
}

export const callGroundedModel = async <T>(
  options: ModelCallOptions<T>,
): Promise<T> => {
  const settings = getFoundrySettings()
  if (!settings.endpoint || !settings.key) {
    throw new Error('Model intelligence is not configured.')
  }

  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        deployment: settings.deployment,
        operation: options.operation,
        request: options.request,
      }),
    )
    .digest('hex')
  const cached = responseCache.get(requestHash)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T
  }

  rateLimit(options.clientId)

  const url = `${settings.endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(settings.deployment)}/chat/completions?api-version=2024-10-21`
  let lastOutputError: unknown

  const outputAttempts = options.regenerateInvalidOutput === false ? 1 : 2
  const attemptTimeoutMs = Math.min(
    settings.timeoutMs,
    options.attemptTimeoutMs ?? settings.timeoutMs,
  )

  for (
    let outputAttempt = 0;
    outputAttempt < outputAttempts;
    outputAttempt += 1
  ) {
    const response = await fetchFoundry(
      url,
      settings.key,
      {
        messages: [
          {
            role: 'system',
            content: `${options.systemPrompt} Return concise JSON only. Never reveal chain-of-thought.`,
          },
          { role: 'user', content: options.userPrompt },
        ],
        temperature: 0,
        max_tokens: options.maxTokens,
        response_format: { type: 'json_object' },
      },
      attemptTimeoutMs,
      options.retryTransient === false ? 1 : 2,
    )
    let body: {
      choices?: Array<{ message?: { content?: string } }>
    }
    try {
      body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
    } catch (error) {
      if (lastOutputError) {
        throw lastOutputError
      }
      throw error
    }
    const content = body.choices?.[0]?.message?.content

    try {
      if (!content) {
        throw new Error('Foundry returned no intelligence output.')
      }
      const normalized = options.normalize(parseModelJson(content))
      responseCache.set(requestHash, {
        expiresAt: Date.now() + cacheLifetimeMs,
        value: normalized,
      })
      return normalized
    } catch (error) {
      lastOutputError = error
      if (outputAttempt < outputAttempts - 1) {
        await wait(100)
        continue
      }
      throw error
    }
  }

  throw lastOutputError instanceof Error
    ? lastOutputError
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
  if (error instanceof z.ZodError) {
    return 400
  }
  return 503
}

export const resetGroundedIntelligenceStateForTests = () => {
  responseCache.clear()
  clientCalls.clear()
  globalCalls = 0
  globalWindowStartedAt = Date.now()
}
