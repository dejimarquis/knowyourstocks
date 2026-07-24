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
    snapshot: {
      earningsGrowth: 0.12,
      operatingMargin: 0.44,
      freeCashFlow: 74_000_000_000,
      debtToEquity: 0.4,
      currentRatio: 1.3,
      metricProvenance: {},
    },
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
  Score: 8.2,
  Opinion: 'promising_but_mixed',
  Summary: 'Quality evidence is supportive, while valuation is a constraint.',
  StrengthEvidenceIds: [1],
  RiskEvidenceIds: ['2'],
  Confidence: 'HIGH',
}

describe('generateResearchIntelligence', () => {
  beforeEach(() => {
    resetGroundedIntelligenceStateForTests()
    process.env.FOUNDRY_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
    process.env.FOUNDRY_API_KEY = 'test-key'
    process.env.FOUNDRY_DEPLOYMENT = 'phi-test'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(modelResponse(validOutput)))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('normalizes score scale, casing, and numeric evidence IDs', async () => {
    const output = await generateResearchIntelligence(request, 'research-client')

    expect(output).toMatchObject({
      score: 82,
      opinion: 'Compelling',
      confidence: 'high',
    })
    expect(output.strengths).toEqual([
      {
        evidenceId: 'quality',
        text: 'Margins and free cash flow support the quality thesis.',
      },
    ])
  })

  it('rejects unknown evidence IDs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({ ...validOutput, RiskEvidenceIds: ['e9'] }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-unknown'),
    ).rejects.toThrow('unknown evidence ID')
  })

  it('rejects misattached evidence IDs', async () => {
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
        modelResponse({ ...validOutput, RiskEvidenceIds: ['e3'] }),
      ),
    )
    await expect(
      generateResearchIntelligence(invalidRequest, 'research-misattached'),
    ).rejects.toThrow('misattached evidence')
  })

  it('rejects unsupported opinions and advice language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({ ...validOutput, Opinion: 'Bullish' }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-opinion'),
    ).rejects.toThrow('unsupported opinion')

    resetGroundedIntelligenceStateForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({ ...validOutput, Summary: 'Buy on the quality evidence.' }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-advice'),
    ).rejects.toThrow('prohibited investment advice')
  })

  it('rejects invented numeric claims in narratives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        modelResponse({
          ...validOutput,
          Summary: 'Quality evidence implies 25 percent upside.',
        }),
      ),
    )
    await expect(
      generateResearchIntelligence(request, 'research-number'),
    ).rejects.toThrow('invented numeric claim')
  })
})
