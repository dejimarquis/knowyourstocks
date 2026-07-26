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

export const researchIntelligenceRequestSchema = z
  .object({
    version: z.literal(1),
    symbol: z.string().min(1).max(16),
    company: z
      .object({
        name: z.string().min(1).max(160),
        sector: z.string().max(120).nullable().optional(),
        industry: z.string().max(120).nullable().optional(),
        snapshot: compactSnapshotSchema.optional(),
      })
      .strict(),
    thesis: thesisSchema,
    deterministicFit: z
      .object({
        total: z.number().min(0).max(100).nullable(),
        label: z.string().max(80),
      })
      .strict()
      .optional(),
    evidence: z.array(groundedEvidenceSchema).min(1).max(24),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = request.evidence.map((item) => item.id.toLowerCase())
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Research evidence IDs must be unique.',
      })
    }
  })

const modelClaimSchema = z
  .object({
    text: z.string().min(1).max(360).regex(/^[^0-9]*$/),
    citationIds: z.array(z.string()).min(1).max(5),
  })
  .strict()

const researchModelSchema = z
  .object({
    opinion: opinionSchema,
    headline: z.string().min(1).max(140).regex(/^[^0-9]*$/),
    reasoningSummary: modelClaimSchema,
    whyItFits: z.array(modelClaimSchema).max(4),
    concerns: z.array(modelClaimSchema).max(4),
    whatToWatchNext: z.array(modelClaimSchema).max(4),
    confidence: confidenceSchema,
    uncertainty: modelClaimSchema,
  })
  .strict()

const citedClaimSchema = z
  .object({
    text: z.string(),
    citationIds: z.array(z.string()),
    citations: z.array(mappedCitationSchema),
  })
  .strict()

export const researchIntelligenceResponseSchema = z
  .object({
    opinion: opinionSchema,
    headline: z.string().min(1).max(140),
    reasoningSummary: citedClaimSchema,
    whyItFits: z.array(citedClaimSchema).max(4),
    concerns: z.array(citedClaimSchema).max(4),
    whatToWatchNext: z.array(citedClaimSchema).max(4),
    confidence: confidenceSchema,
    uncertainty: citedClaimSchema,
  })
  .strict()

export type ResearchIntelligenceRequest = z.infer<
  typeof researchIntelligenceRequestSchema
>
export type ResearchIntelligenceResponse = z.infer<
  typeof researchIntelligenceResponseSchema
>

export const parseResearchIntelligenceRequest = (
  value: unknown,
): ResearchIntelligenceRequest =>
  parseIntelligenceRequestBody(researchIntelligenceRequestSchema, value)

const researchResponseJsonSchema = (evidenceIds: string[]): JsonSchema => ({
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
    headline: { type: 'string' },
    reasoningSummary: { $ref: '#/$defs/claim' },
    whyItFits: {
      type: 'array',
      maxItems: 5,
      items: { $ref: '#/$defs/claim' },
    },
    concerns: {
      type: 'array',
      maxItems: 4,
      items: { $ref: '#/$defs/claim' },
    },
    whatToWatchNext: {
      type: 'array',
      maxItems: 4,
      items: { $ref: '#/$defs/claim' },
    },
    confidence: { type: 'string', enum: confidenceSchema.options },
    uncertainty: { $ref: '#/$defs/claim' },
  },
  $defs: {
    claim: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'citationIds'],
      properties: {
        text: { type: 'string' },
        citationIds: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { type: 'string', enum: evidenceIds },
        },
      },
    },
  },
})

const evidenceForSymbol = (
  evidence: GroundedEvidence[],
  symbol: string,
) => {
  if (evidence.some((item) => item.symbol.toUpperCase() !== symbol.toUpperCase())) {
    throw new Error('Model returned misattached evidence IDs.')
  }
  return evidence
}

const normalizeResearchOutput = (
  value: unknown,
  request: ResearchIntelligenceRequest,
): ResearchIntelligenceResponse => {
  const model = researchModelSchema.parse(value)
  const catalog = createEvidenceCatalog(request.evidence)

  const mapClaim = (claim: z.infer<typeof modelClaimSchema>) => {
    const evidence = evidenceForSymbol(
      catalog.resolveIds(claim.citationIds, { min: 1, max: 5 }),
      request.symbol,
    )
    assertNoProhibitedAdvice([claim.text])
    assertNoNumericNarrative([claim.text])
    assertNoInventedNumericClaims(claim.text, evidence)
    return {
      text: claim.text,
      citationIds: evidence.map((item) => item.id),
      citations: mapCitations(evidence),
    }
  }

  assertNoProhibitedAdvice([model.headline])
  assertNoNumericNarrative([model.headline])
  assertNoInventedNumericClaims(model.headline, request.evidence)

  return researchIntelligenceResponseSchema.parse({
    opinion: model.opinion,
    headline: model.headline,
    reasoningSummary: mapClaim(model.reasoningSummary),
    whyItFits: model.whyItFits.map(mapClaim),
    concerns: model.concerns.map(mapClaim),
    whatToWatchNext: model.whatToWatchNext.map(mapClaim),
    confidence: model.confidence,
    uncertainty: mapClaim(model.uncertainty),
  })
}

export const generateResearchIntelligence = async (
  request: ResearchIntelligenceRequest,
  clientId: string,
) => {
  const catalog = createEvidenceCatalog(request.evidence)
  return callGroundedModel({
    operation: 'research',
    request,
    clientId,
    maxTokens: 1_600,
    attemptTimeoutMs: 20_000,
    reasoningEffort: 'low',
    responseSchema: {
      name: 'research_opinion',
      schema: researchResponseJsonSchema(
        request.evidence.map((item) => item.id),
      ),
    },
    systemPrompt:
      'Assess how the stock is doing and how the supplied evidence fits the user thesis. Opinions are research labels, never trade instructions. Use only supplied evidence IDs. Generated narrative text must contain no digits or numeric values. Do not invent facts, prices, targets, guarantees, or predictions.',
    userPrompt: `Symbol: ${request.symbol}
Company: ${request.company.name}
Classification: ${request.company.sector ?? 'unknown'} / ${request.company.industry ?? 'unknown'}
Thesis: ${request.thesis.style}; ${request.thesis.horizon}; ${request.thesis.risk}; sectors ${request.thesis.sectors.join(', ')}
${request.thesis.note ? `Optional thesis note: ${request.thesis.note}\n` : ''}Evidence:
${catalog.lines.join('\n')}
Return one opinion label (Fits thesis, Mixed, Weak fit, or Insufficient evidence), a short headline, a concise cited reasoningSummary, cited whyItFits points, cited concerns, cited whatToWatchNext points, confidence, and a cited uncertainty statement. Every claim object must cite one or more exact supplied evidence IDs shown in parentheses; do not return evidence aliases or any score.`,
    normalize: (value) => normalizeResearchOutput(value, request),
  })
}
