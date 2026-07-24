import { createHash } from 'node:crypto'
import { z } from 'zod'

const evidenceSchema = z.object({
  label: z.string().max(120),
  current: z.string().max(160),
  previous: z.string().max(160).nullable(),
})

const signalSchema = z.object({
  id: z.string().max(180),
  symbol: z.string().max(12).nullable(),
  type: z.string().max(60),
  severity: z.enum(['attention', 'watch', 'informational', 'stable']),
  title: z.string().max(180),
  summary: z.string().max(500),
  evidence: z.array(evidenceSchema).max(8),
})

const watchlistItemSchema = z.object({
  symbol: z.string().max(12),
  name: z.string().max(160),
  sector: z.string().max(120).nullable(),
  industry: z.string().max(120).nullable(),
  fit: z.number().min(0).max(100).nullable(),
  fitLabel: z.string().max(60),
})

const requestSchema = z.object({
  version: z.literal(1),
  thesis: z.object({
    sectors: z.array(z.string().max(80)).max(4),
    horizon: z.string().max(40),
    risk: z.string().max(40),
    style: z.string().max(40),
    note: z.string().max(500).optional(),
  }),
  watchlist: z.array(watchlistItemSchema).min(1).max(25),
  deterministicSignals: z.array(signalSchema).max(75),
  stableSymbols: z.array(z.string().max(12)).max(25),
})

const patternSchema = z.object({
  title: z.string().min(1).max(120),
  explanation: z.string().min(1).max(360),
  evidenceIds: z.array(z.string()).min(2).max(8),
  confidence: z.enum(['low', 'medium', 'high']),
  thesisRelationship: z.string().min(1).max(240),
})

const modelOutputSchema = z.object({
  prioritizedSignalIds: z.array(z.string()).max(75),
  summary: z.string().min(1).max(500),
  experimentalPatterns: z.array(patternSchema).max(3),
  uncertainties: z.array(z.string().max(240)).max(6),
})

const detailedSelectionSchema = z.object({
  order: z.array(z.string()).max(75),
  patterns: z.array(
    z.object({
      evidenceIds: z.array(z.string()).min(2).max(8),
      label: z.string().min(1).max(120),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
  ).max(3),
  uncertainties: z.array(z.string().max(240)).max(6),
})

const simplifiedSelectionSchema = z.object({
  relationship: z.string().min(1).max(120),
  value: z.string().min(1).max(180),
})

const phiCompactSelectionSchema = z.object({
  priority_order: z.array(z.string()).max(75),
  cross_signals: z.array(z.record(z.string(), z.unknown())).max(3),
})

const modelSelectionSchema = z.union([
  detailedSelectionSchema,
  simplifiedSelectionSchema,
  phiCompactSelectionSchema,
])

export type WatchlistIntelligenceRequest = z.infer<typeof requestSchema>
export type WatchlistIntelligenceOutput = z.infer<typeof modelOutputSchema>

const prohibitedAdvice = /\b(buy|sell|hold|short|strong buy|strong sell)\b/i
const cacheLifetimeMs = 6 * 60 * 60 * 1000
const dailyWindowMs = 24 * 60 * 60 * 1000

const responseCache = new Map<
  string,
  { expiresAt: number; value: WatchlistIntelligenceOutput }
>()
let globalWindowStartedAt = Date.now()
let globalCalls = 0
const clientCalls = new Map<string, { windowStartedAt: number; count: number }>()

const getSettings = () => ({
  endpoint: process.env.FOUNDRY_OPENAI_ENDPOINT,
  key: process.env.FOUNDRY_API_KEY,
  deployment: process.env.FOUNDRY_DEPLOYMENT ?? 'phi-4-mini-watchlist',
  maxDailyCalls: Number(process.env.FOUNDRY_MAX_DAILY_CALLS ?? 500),
  maxClientDailyCalls: Number(process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS ?? 10),
})

const rateLimit = (clientId: string) => {
  const now = Date.now()
  const settings = getSettings()

  if (now - globalWindowStartedAt >= dailyWindowMs) {
    globalWindowStartedAt = now
    globalCalls = 0
  }

  if (globalCalls >= settings.maxDailyCalls) {
    throw new Error('The daily intelligence budget has been reached.')
  }

  const current = clientCalls.get(clientId)
  const client =
    !current || now - current.windowStartedAt >= dailyWindowMs
      ? { windowStartedAt: now, count: 0 }
      : current

  if (client.count >= settings.maxClientDailyCalls) {
    throw new Error('The daily intelligence limit for this browser was reached.')
  }

  globalCalls += 1
  client.count += 1
  clientCalls.set(clientId, client)
}

const prompt = (packet: WatchlistIntelligenceRequest) => {
  const aliasToSignal = new Map<string, string>()
  const signalLines = packet.deterministicSignals.map((signal, index) => {
    const alias = `s${index + 1}`
    aliasToSignal.set(alias, signal.id)
    return `${alias} | ${signal.symbol ?? 'watchlist'} | ${signal.type} | ${signal.severity} | ${signal.title} | ${signal.summary}`
  })

  return {
    aliases: aliasToSignal,
    body: {
      messages: [
        {
          role: 'system',
          content: `Return JSON only with exact keys order, patterns, uncertainties.
Use only supplied aliases such as s1.
Each pattern requires at least two aliases.
Never repeat the input. Never use buy, sell, hold, short, or guaranteed-return language.
Example output:
{"order":["s1","s2"],"patterns":[{"evidenceIds":["s1","s2"],"label":"Business momentum changed","confidence":"medium"}],"uncertainties":[]}`,
        },
        {
          role: 'user',
          content: `Thesis sectors: ${packet.thesis.sectors.join(', ')}
Horizon: ${packet.thesis.horizon}
Risk: ${packet.thesis.risk}
Style: ${packet.thesis.style}
${packet.thesis.note ? `Optional thesis note: ${packet.thesis.note}\n` : ''}Signals:
${signalLines.join('\n')}
Stable: ${packet.stableSymbols.join(', ') || 'none'}
Select the priority order and any cross-signal patterns.`,
        },
      ],
      temperature: 0,
      max_tokens: 280,
      response_format: { type: 'json_object' },
    },
  }
}

const selectionToOutput = (
  selection: z.infer<typeof modelSelectionSchema>,
  packet: WatchlistIntelligenceRequest,
  aliases: Map<string, string>,
): WatchlistIntelligenceOutput => {
  const signalsById = new Map(
    packet.deterministicSignals.map((signal) => [signal.id, signal]),
  )
  const normalizedSelection = 'order' in selection
    ? selection
    : 'priority_order' in selection
      ? {
          order: selection.priority_order,
          patterns: selection.cross_signals
            .map((pattern) => {
              const candidateIds =
                pattern.evidenceIds ??
                pattern.signal_ids ??
                pattern.signals ??
                []
              const evidenceIds = Array.isArray(candidateIds)
                ? candidateIds.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : []
              const label =
                typeof pattern.label === 'string'
                  ? pattern.label
                  : typeof pattern.relationship === 'string'
                    ? pattern.relationship
                    : 'Possible cross-signal relationship'
              const confidence: 'low' | 'medium' | 'high' =
                pattern.confidence === 'high'
                  ? 'high'
                  : pattern.confidence === 'medium'
                    ? 'medium'
                    : 'low'
              return { evidenceIds, label, confidence }
            })
            .filter((pattern) => pattern.evidenceIds.length >= 2),
          uncertainties: [],
        }
      : (() => {
        const selectedAlias = aliases.has(selection.value)
          ? selection.value
          : [...aliases.entries()].find(([, id]) =>
              id.includes(selection.value),
            )?.[0]
        const selectedId = selectedAlias
          ? aliases.get(selectedAlias)
          : undefined
        const selectedSignal = selectedId
          ? signalsById.get(selectedId)
          : undefined
        const relatedAlias = selectedSignal
          ? [...aliases.entries()].find(([alias, id]) => {
              if (alias === selectedAlias) {
                return false
              }

              const signal = signalsById.get(id)
              return (
                signal?.symbol === selectedSignal.symbol ||
                signal?.type === 'concentration'
              )
            })?.[0]
          : undefined
        const evidenceIds = [selectedAlias, relatedAlias].filter(
          (value): value is string => Boolean(value),
        )

        return {
          order: selectedAlias ? [selectedAlias] : [],
          patterns:
            evidenceIds.length >= 2
              ? [
                  {
                    evidenceIds,
                    label: selection.relationship
                      .replaceAll('_', ' ')
                      .replace(/\b\w/g, (value) => value.toUpperCase()),
                    confidence: 'low' as const,
                  },
                ]
              : [],
          uncertainties: [
            'Phi returned a simplified relationship, so confidence was reduced.',
          ],
        }
        })()
  const prioritizedSignalIds = normalizedSelection.order
    .map((alias) => aliases.get(alias))
    .filter((id): id is string => id != null)
  const experimentalPatterns = normalizedSelection.patterns.map((pattern) => {
    const evidenceIds = pattern.evidenceIds
      .map((alias) => aliases.get(alias))
      .filter((id): id is string => id != null)
    const evidence = evidenceIds
      .map((id) => signalsById.get(id))
      .filter((signal): signal is z.infer<typeof signalSchema> => signal != null)

    return {
      title: pattern.label,
      explanation: evidence.map((signal) => signal.summary).join(' '),
      evidenceIds,
      confidence: pattern.confidence,
      thesisRelationship: `This pattern may matter to the ${packet.thesis.style} style and ${packet.thesis.horizon} horizon in the supplied thesis.`,
    }
  })

  return {
    prioritizedSignalIds,
    summary:
      experimentalPatterns.length > 0
        ? 'Several verified watchlist signals may be connected. Review the evidence before drawing a conclusion.'
        : 'The brief is ordered by verified severity and thesis relevance.',
    experimentalPatterns,
    uncertainties: normalizedSelection.uncertainties,
  }
}

const validateOutput = (
  value: unknown,
  packet: WatchlistIntelligenceRequest,
): WatchlistIntelligenceOutput => {
  const output = modelOutputSchema.parse(value)
  const evidenceIds = new Set(
    packet.deterministicSignals.map((signal) => signal.id),
  )

  if (
    output.prioritizedSignalIds.some((signalId) => !evidenceIds.has(signalId))
  ) {
    throw new Error('Model returned an unknown prioritized signal.')
  }

  output.experimentalPatterns.forEach((pattern) => {
    if (pattern.evidenceIds.some((signalId) => !evidenceIds.has(signalId))) {
      throw new Error('Model returned an unknown pattern evidence ID.')
    }
  })

  const narratives = [
    output.summary,
    ...output.uncertainties,
    ...output.experimentalPatterns.flatMap((pattern) => [
      pattern.title,
      pattern.explanation,
      pattern.thesisRelationship,
    ]),
  ]

  if (narratives.some((text) => prohibitedAdvice.test(text))) {
    throw new Error('Model returned prohibited investment advice language.')
  }

  return output
}

export const parseIntelligenceRequest = (
  value: unknown,
): WatchlistIntelligenceRequest => requestSchema.parse(value)

export const generateWatchlistIntelligence = async (
  request: WatchlistIntelligenceRequest,
  clientId: string,
): Promise<WatchlistIntelligenceOutput> => {
  const settings = getSettings()

  if (!settings.endpoint || !settings.key) {
    throw new Error('Model intelligence is not configured.')
  }

  const packetHash = createHash('sha256')
    .update(JSON.stringify(request))
    .digest('hex')
  const cached = responseCache.get(packetHash)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  rateLimit(clientId)

  const generation = prompt(request)
  const url = `${settings.endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(settings.deployment)}/chat/completions?api-version=2024-10-21`
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(12_000),
    headers: {
      'Content-Type': 'application/json',
      'api-key': settings.key,
    },
    body: JSON.stringify(generation.body),
  })

  if (!response.ok) {
    throw new Error(`Foundry returned HTTP ${response.status}.`)
  }

  const value = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = value.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('Foundry returned no intelligence output.')
  }

  const selection = modelSelectionSchema.parse(JSON.parse(content))
  const output = validateOutput(
    selectionToOutput(selection, request, generation.aliases),
    request,
  )
  responseCache.set(packetHash, {
    expiresAt: Date.now() + cacheLifetimeMs,
    value: output,
  })
  return output
}
