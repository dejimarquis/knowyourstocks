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
} from './groundedIntelligence'

export const researchIntelligenceRequestSchema = z
  .object({
    version: z.literal(1),
    symbol: z.string().min(1).max(16),
    company: z.object({
      name: z.string().min(1).max(160),
      sector: z.string().max(120).nullable().optional(),
      industry: z.string().max(120).nullable().optional(),
      snapshot: compactSnapshotSchema.optional(),
    }),
    thesis: thesisSchema,
    deterministicFit: z
      .object({
        total: z.number().min(0).max(100).nullable(),
        label: z.string().max(80),
      })
      .optional(),
    evidence: z.array(groundedEvidenceSchema).min(1).max(24),
  })
  .superRefine((request, context) => {
    const ids = request.evidence.map((item) => item.id.toLowerCase())
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Research evidence IDs must be unique.',
      })
    }
  })

const mappedEvidenceSchema = z.object({
  evidenceId: z.string(),
  text: z.string(),
})

export const researchIntelligenceResponseSchema = z.object({
  score: z.number().int().min(0).max(100),
  opinion: opinionSchema,
  summary: z.string().min(1).max(300),
  strengths: z.array(mappedEvidenceSchema).max(3),
  risks: z.array(mappedEvidenceSchema).max(3),
  confidence: confidenceSchema,
})

export type ResearchIntelligenceRequest = z.infer<
  typeof researchIntelligenceRequestSchema
>
export type ResearchIntelligenceResponse = z.infer<
  typeof researchIntelligenceResponseSchema
>

export const parseResearchIntelligenceRequest = (
  value: unknown,
): ResearchIntelligenceRequest => researchIntelligenceRequestSchema.parse(value)

const normalizeResearchOutput = (
  value: unknown,
  request: ResearchIntelligenceRequest,
): ResearchIntelligenceResponse => {
  const record = asRecord(value)
  const catalog = createEvidenceCatalog(request.evidence)
  const score = normalizeScore(
    pick(record, ['score', 'Score', 'thesisEvidenceScore', 'thesis_evidence_score']),
  )
  const opinion = normalizeOpinion(
    pick(record, ['opinion', 'Opinion']),
    score,
  )
  const summary = pick(record, ['summary', 'Summary', 'assessment'])
  let strengths = catalog.resolveIds(
    pick(record, [
      'strengthEvidenceIds',
      'StrengthEvidenceIds',
      'strength_evidence_ids',
      'strengths',
    ]),
    { min: 1, max: 3 },
  )
  let risks = catalog.resolveIds(
    pick(record, [
      'riskEvidenceIds',
      'RiskEvidenceIds',
      'risk_evidence_ids',
      'risks',
    ]),
    { min: 1, max: 3 },
  )
  const confidence = normalizeConfidence(
    pick(record, ['confidence', 'Confidence']),
  )

  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Error('Model returned an invalid research summary.')
  }

  const symbol = request.symbol.toUpperCase()
  if (
    [...strengths, ...risks].some(
      (item) => item.symbol.toUpperCase() !== symbol,
    )
  ) {
    throw new Error('Model returned misattached evidence IDs.')
  }

  const riskLanguage = /\b(weakens|mixed|unavailable|uncertainty|risk|extremely high)\b/i
  const misplacedRisks = strengths.filter((item) =>
    riskLanguage.test(item.text),
  )
  strengths = strengths.filter((item) => !riskLanguage.test(item.text))
  risks = [...risks, ...misplacedRisks].filter(
    (item, index, values) =>
      values.findIndex((candidate) => candidate.id === item.id) === index,
  )

  if (strengths.length === 0) {
    const fallback = request.evidence.find(
      (item) => !riskLanguage.test(item.text),
    )
    if (fallback) strengths = [fallback]
  }
  if (risks.length === 0) {
    const fallback = request.evidence.find((item) =>
      riskLanguage.test(item.text),
    )
    if (fallback) risks = [fallback]
  }
  strengths = strengths.slice(0, 3)
  risks = risks.slice(0, 3)

  assertNoProhibitedAdvice([summary])
  assertNoInventedNumericClaims(summary, [...strengths, ...risks])

  return researchIntelligenceResponseSchema.parse({
    score,
    opinion,
    summary: summary.trim().slice(0, 300),
    strengths: strengths.map((item) => ({
      evidenceId: item.id,
      text: item.text,
    })),
    risks: risks.map((item) => ({
      evidenceId: item.id,
      text: item.text,
    })),
    confidence,
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
    maxTokens: 360,
    attemptTimeoutMs: 10_000,
    regenerateInvalidOutput: true,
    systemPrompt:
      'Assess how strongly supplied evidence supports the supplied thesis. The score is not a return forecast. Use only supplied evidence aliases and supported opinion labels. Do not give trade instructions or add numeric claims to narratives.',
    userPrompt: `Symbol: ${request.symbol}
Company: ${request.company.name}
Classification: ${request.company.sector ?? 'unknown'} / ${request.company.industry ?? 'unknown'}
Thesis: ${request.thesis.style}; ${request.thesis.horizon}; ${request.thesis.risk}; sectors ${request.thesis.sectors.join(', ')}
${request.thesis.note ? `Optional thesis note: ${request.thesis.note}\n` : ''}${request.deterministicFit ? `Deterministic fit context: ${request.deterministicFit.total ?? 'unavailable'} (${request.deterministicFit.label})\n` : ''}Evidence:
${catalog.lines.join('\n')}
Return keys score, opinion, summary, strengthEvidenceIds, riskEvidenceIds, confidence. Score may be 0-100. Opinion must be Compelling, Promising but mixed, Watch closely, or Reconsider. Select one to three strength IDs and one to three risk or missing-data IDs. Do not copy numbers into summary.`,
    normalize: (value) => normalizeResearchOutput(value, request),
  })
}
