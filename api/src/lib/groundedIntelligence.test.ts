import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  IntelligenceRequestError,
  assertNoNumericNarrative,
  assertNoProhibitedAdvice,
  callGroundedModel,
  createEvidenceCatalog,
  intelligenceErrorResponse,
  intelligenceErrorStatus,
  parseIntelligenceRequestBody,
  parseModelJson,
  resetGroundedIntelligenceStateForTests,
} from './groundedIntelligence'

const response = (content: string, status = 200) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status },
  )

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['result'],
  properties: { result: { type: 'string' } },
}

const options = (
  operation: 'research' | 'recommendations' | 'watchlist',
  request: unknown,
) => ({
  operation,
  request,
  clientId: 'shared-client',
  systemPrompt: 'Use evidence.',
  userPrompt: 'Evidence: e1.',
  maxTokens: 50,
  responseSchema: { name: 'test_output', schema },
  normalize: (value: unknown) => value,
})

describe('grounded intelligence client', () => {
  it('extracts one complete JSON object and ignores trailing model text', () => {
    expect(
      parseModelJson(
        '{"result":{"text":"Grounded {opinion}."}} trailing reasoning {"ignored":true}',
      ),
    ).toEqual({ result: { text: 'Grounded {opinion}.' } })
    expect(
      parseModelJson('prefix {not json} then {"result":"ok"}'),
    ).toEqual({ result: 'ok' })
    expect(
      parseModelJson('prefix "{" then {"result":"ok"}'),
    ).toEqual({ result: 'ok' })
    expect(
      parseModelJson(
        '{"text":"claim"} then {"overallOpinion":"Mixed","stocks":[]}',
      ),
    ).toEqual({ overallOpinion: 'Mixed', stocks: [] })
  })

  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'gpt-5-mini-intelligence'
    delete process.env.FOUNDRY_RESEARCH_DEPLOYMENT
    delete process.env.FOUNDRY_RECOMMENDATION_DEPLOYMENT
    delete process.env.FOUNDRY_WATCHLIST_DEPLOYMENT
    delete process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.FOUNDRY_RESEARCH_DEPLOYMENT
    delete process.env.FOUNDRY_RECOMMENDATION_DEPLOYMENT
    delete process.env.FOUNDRY_WATCHLIST_DEPLOYMENT
    delete process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS
  })

  it('sends strict JSON Schema and GPT-5 completion tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('{"result":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)

    await callGroundedModel({
      ...options('research', { packet: 1 }),
      reasoningEffort: 'low',
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.max_completion_tokens).toBe(50)
    expect(body.reasoning_effort).toBe('low')
    expect(body.max_tokens).toBeUndefined()
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'test_output', strict: true, schema },
    })
    expect(body.messages[0].content).toContain(
      'must contain no digits and no number words',
    )
  })

  it('keeps legacy JSON mode only for Phi rollback calls', async () => {
    process.env.FOUNDRY_DEPLOYMENT = 'phi-4-mini-watchlist'
    const fetchMock = vi.fn().mockResolvedValue(response('{"result":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)
    const legacy = { ...options('research', { legacy: true }) }
    delete (legacy as Partial<typeof legacy>).responseSchema

    await callGroundedModel(legacy)

    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    )
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.max_tokens).toBe(50)
    expect(body.max_completion_tokens).toBeUndefined()
  })

  it('rejects schema-less calls for non-Phi deployments', async () => {
    const strict = { ...options('research', { strict: true }) }
    delete (strict as Partial<typeof strict>).responseSchema
    await expect(callGroundedModel(strict)).rejects.toThrow(
      'Strict JSON schema is required',
    )
  })

  it('routes each operation to its default deployment', async () => {
    delete process.env.FOUNDRY_DEPLOYMENT
    const fetchMock = vi.fn().mockResolvedValue(response('{"result":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)

    await callGroundedModel(options('research', { packet: 'research' }))
    await callGroundedModel(
      options('recommendations', { packet: 'recommendations' }),
    )
    await callGroundedModel(options('watchlist', { packet: 'watchlist' }))

    expect(fetchMock.mock.calls[0][0]).toContain('gpt-5-mini-intelligence')
    expect(fetchMock.mock.calls[1][0]).toContain('gpt-5-mini-intelligence')
    expect(fetchMock.mock.calls[2][0]).toContain('gpt-oss-120b-intelligence')
  })

  it('prefers operation overrides and supports the rollback fallback', async () => {
    process.env.FOUNDRY_DEPLOYMENT = 'rollback-deployment'
    process.env.FOUNDRY_RESEARCH_DEPLOYMENT = 'research-deployment'
    process.env.FOUNDRY_RECOMMENDATION_DEPLOYMENT =
      'recommendation-deployment'
    process.env.FOUNDRY_WATCHLIST_DEPLOYMENT = 'watchlist-deployment'
    const fetchMock = vi.fn().mockResolvedValue(response('{"result":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)

    await callGroundedModel(options('research', { packet: 'research' }))
    await callGroundedModel(
      options('recommendations', { packet: 'recommendations' }),
    )
    await callGroundedModel(options('watchlist', { packet: 'watchlist' }))

    expect(fetchMock.mock.calls[0][0]).toContain('research-deployment')
    expect(fetchMock.mock.calls[1][0]).toContain('recommendation-deployment')
    expect(fetchMock.mock.calls[2][0]).toContain('watchlist-deployment')

    resetGroundedIntelligenceStateForTests()
    delete process.env.FOUNDRY_RESEARCH_DEPLOYMENT
    await callGroundedModel(options('research', { packet: 'fallback' }))
    expect(fetchMock.mock.calls[3][0]).toContain('rollback-deployment')
  })

  it('separates cache entries by the selected deployment and operation', async () => {
    delete process.env.FOUNDRY_DEPLOYMENT
    const fetchMock = vi.fn().mockResolvedValue(response('{"result":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)

    await callGroundedModel(options('research', { packet: 1 }))
    await callGroundedModel(options('research', { packet: 1 }))
    process.env.FOUNDRY_RESEARCH_DEPLOYMENT = 'deployment-b'
    await callGroundedModel(options('research', { packet: 1 }))
    await callGroundedModel(options('watchlist', { packet: 1 }))

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toContain('gpt-5-mini-intelligence')
    expect(fetchMock.mock.calls[1][0]).toContain('deployment-b')
    expect(fetchMock.mock.calls[2][0]).toContain('gpt-oss-120b-intelligence')
  })

  it.each([
    ['timeout', Object.assign(new Error('timed out'), { name: 'AbortError' })],
    ['transport failure', new TypeError('network failed')],
  ])('retries one %s and succeeds', async (_label, error) => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(response('{"result":"recovered"}'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('watchlist', { retry: _label })),
    ).resolves.toEqual({ result: 'recovered' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries malformed output once and then fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('not json'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('research', { invalid: 1 })),
    ).rejects.toThrow('invalid JSON')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a refusal once and then fails', async () => {
    const refusal = new Response(
      JSON.stringify({
        choices: [{ message: { refusal: 'Unable to comply.' } }],
      }),
      { status: 200 },
    )
    const fetchMock = vi.fn().mockResolvedValue(refusal)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callGroundedModel(options('research', { refusal: 1 })),
    ).rejects.toThrow('refused')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ignores reasoning_content and parses only message.content', async () => {
    const foundryResponse = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"result":"visible"}',
              reasoning_content: '{"result":"hidden"}',
            },
          },
        ],
      }),
      { status: 200 },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(foundryResponse))

    await expect(
      callGroundedModel(options('watchlist', { reasoning: true })),
    ).resolves.toEqual({ result: 'visible' })
  })

  it('enforces process-local limits without charging cache hits', async () => {
    process.env.FOUNDRY_MAX_CLIENT_DAILY_CALLS = '1'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response('{"result":"ok"}')),
    )

    await callGroundedModel(options('research', { packet: 1 }))
    await callGroundedModel(options('research', { packet: 1 }))
    await expect(
      callGroundedModel(options('research', { packet: 2 })),
    ).rejects.toThrow('daily intelligence limit')
  })

  it('resolves supplied aliases and rejects unknown citations', () => {
    const catalog = createEvidenceCatalog([
      { id: 'margin', symbol: 'TEST', text: 'Margin is positive.' },
    ])
    expect(catalog.resolveIds(['e1'])[0].id).toBe('margin')
    expect(() => catalog.resolveIds(['e2'])).toThrow('unknown evidence ID')
  })

  it('rejects explicit trade commands and guarantees', () => {
    expect(() => assertNoProhibitedAdvice(['Buy this stock now.'])).toThrow(
      'prohibited investment advice',
    )
    expect(() => assertNoProhibitedAdvice(['Returns are guaranteed.'])).toThrow(
      'prohibited investment advice',
    )
    expect(() =>
      assertNoNumericNarrative(['Revenue increased by 12 percent.']),
    ).toThrow('digits or numeric values')
    expect(() =>
      assertNoNumericNarrative(['Revenue roughly doubled.']),
    ).toThrow('digits or numeric values')
  })

  it('maps request validation to 400 and upstream failures to 503', () => {
    const requestSchema = z.object({ version: z.literal(1) }).strict()
    expect(() => parseIntelligenceRequestBody(requestSchema, {})).toThrow(
      IntelligenceRequestError,
    )
    expect(
      intelligenceErrorStatus(new IntelligenceRequestError('invalid')),
    ).toBe(400)
    expect(intelligenceErrorStatus(new Error('Foundry refused.'))).toBe(503)
    expect(intelligenceErrorStatus(new Error('Foundry returned HTTP 429.'))).toBe(
      429,
    )
    expect(intelligenceErrorResponse(new Error('secret upstream detail'))).toEqual({
      status: 503,
      jsonBody: {
        error: 'Intelligence is temporarily unavailable.',
        code: 'INTELLIGENCE_UNAVAILABLE',
        retryable: true,
      },
    })
  })
})
