import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetGroundedIntelligenceStateForTests } from './groundedIntelligence'
import {
  generateResearchIntelligence,
  parseResearchIntelligenceRequest,
} from './researchIntelligence'

const request = parseResearchIntelligenceRequest({
  version: 1,
  symbol: 'MSFT',
  company: {
    name: 'Microsoft',
    sector: 'Technology',
    industry: 'Software',
  },
  thesis: {
    sectors: ['technology'],
    horizon: 'long-term',
    risk: 'balanced',
    style: 'quality',
  },
  deterministicFit: { total: 82, label: 'Strong match' },
  evidence: [
    {
      id: 'quality',
      symbol: 'MSFT',
      text: 'Margins and free cash flow support the quality thesis.',
    },
    {
      id: 'valuation',
      symbol: 'MSFT',
      text: 'Valuation is above the preferred range.',
    },
  ],
})

const modelResponse = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200 },
  )

const validOutput = {
  opinion: 'Mixed',
  headline: 'Quality fit has a valuation caveat.',
  reasoningSummary: {
    text: 'Quality evidence supports the thesis, while valuation is a concern.',
    citationIds: ['quality', 'valuation'],
  },
  whyItFits: [
    {
      text: 'Margins and cash flow support the quality thesis.',
      citationIds: ['quality'],
    },
  ],
  concerns: [
    {
      text: 'Valuation is above the preferred range.',
      citationIds: ['valuation'],
    },
  ],
  whatToWatchNext: [
    {
      text: 'Research whether valuation moves toward the preferred range.',
      citationIds: ['valuation'],
    },
  ],
  confidence: 'high',
  uncertainty: {
    text: 'The supplied evidence does not resolve the valuation concern.',
    citationIds: ['valuation'],
  },
}

describe('generateResearchIntelligence', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'gpt-5-mini-intelligence'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(modelResponse(validOutput)))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns cited opinion fields with no AI score', async () => {
    const output = await generateResearchIntelligence(request, 'research-client')

    expect(output).toMatchObject({
      opinion: 'Mixed',
      headline: 'Quality fit has a valuation caveat.',
      confidence: 'high',
    })
    expect('score' in output).toBe(false)
    expect(output.reasoningSummary.citationIds).toEqual(['quality', 'valuation'])
    expect(output.whyItFits[0].citations[0]).toEqual({
      evidenceId: 'quality',
      symbol: 'MSFT',
      text: 'Margins and free cash flow support the quality thesis.',
    })
    for (const claim of [
      output.reasoningSummary,
      ...output.whyItFits,
      ...output.concerns,
      ...output.whatToWatchNext,
      output.uncertainty,
    ]) {
      expect(claim.citations.length).toBeGreaterThan(0)
    }
  })

  it('uses a strict schema with every field required and no score property', async () => {
    await generateResearchIntelligence(request, 'research-schema')
    const body = JSON.parse(
      String(
        ((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit)
          .body,
      ),
    )
    const jsonSchema = body.response_format.json_schema.schema
    expect(body.messages[0].content).toContain(
      'must contain no digits or numeric values',
    )
    expect(jsonSchema.additionalProperties).toBe(false)
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining([
        'opinion',
        'headline',
        'reasoningSummary',
        'whyItFits',
        'concerns',
        'whatToWatchNext',
        'confidence',
        'uncertainty',
      ]),
    )
    expect(jsonSchema.properties.score).toBeUndefined()
    expect(jsonSchema.$defs.claim.additionalProperties).toBe(false)
    expect(jsonSchema.$defs.claim.properties.citationIds.items).toEqual({
      type: 'string',
      enum: ['quality', 'valuation'],
    })
    expect(
      jsonSchema.$defs.claim.properties.citationIds.items.enum,
    ).not.toContain('e9')
  })

  it('strictly rejects extra request fields', () => {
    expect(() =>
      parseResearchIntelligenceRequest({
        ...request,
        unexpected: true,
      }),
    ).toThrow('Invalid intelligence request')
  })

  it('rejects unknown citation IDs after one schema retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          modelResponse({
            ...validOutput,
            concerns: [{ text: 'Unknown concern.', citationIds: ['e9'] }],
          }),
        ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-unknown'),
    ).rejects.toThrow('unknown evidence ID')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects citations attached to another symbol', async () => {
    const invalidRequest = parseResearchIntelligenceRequest({
      ...request,
      evidence: [
        ...request.evidence,
        { id: 'other', symbol: 'NVDA', text: 'Another company is growing.' },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({
          ...validOutput,
          concerns: [{ text: 'Another company is growing.', citationIds: ['other'] }],
        }),
      ),
    )
    await expect(
      generateResearchIntelligence(invalidRequest, 'research-misattached'),
    ).rejects.toThrow('misattached evidence')
  })

  it('rejects scores and unsupported opinion labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(modelResponse({ ...validOutput, score: 82 })),
    )
    await expect(
      generateResearchIntelligence(request, 'research-score'),
    ).rejects.toThrow()

    resetGroundedIntelligenceStateForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({ ...validOutput, opinion: 'Strong buy' }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-opinion'),
    ).rejects.toThrow()
  })

  it('rejects trade commands and invented numeric claims', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({
          ...validOutput,
          reasoningSummary: {
            text: 'Buy because quality evidence supports the thesis.',
            citationIds: ['quality'],
          },
        }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-advice'),
    ).rejects.toThrow('prohibited investment advice')

    resetGroundedIntelligenceStateForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({
          ...validOutput,
          reasoningSummary: {
            text: 'Quality evidence implies 25 percent upside.',
            citationIds: ['quality'],
          },
        }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-number'),
    ).rejects.toThrow('must match pattern')
  })
})
