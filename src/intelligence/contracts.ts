import { z } from 'zod'

export const opinionSchema = z.enum([
  'Fits thesis',
  'Mixed',
  'Weak fit',
  'Insufficient evidence',
])

export const confidenceSchema = z.enum(['low', 'medium', 'high'])

export const citationSchema = z
  .object({
    evidenceId: z.string(),
    symbol: z.string(),
    text: z.string(),
  })
  .strict()

export const citedClaimSchema = z
  .object({
    text: z.string(),
    citationIds: z.array(z.string()),
    citations: z.array(citationSchema),
  })
  .strict()

export const intelligenceErrorSchema = z
  .object({
    error: z.string(),
    code: z.enum([
      'INVALID_REQUEST',
      'INTELLIGENCE_LIMIT_REACHED',
      'INTELLIGENCE_UNAVAILABLE',
    ]),
    retryable: z.boolean(),
  })
  .strict()

export type Opinion = z.infer<typeof opinionSchema>
export type Confidence = z.infer<typeof confidenceSchema>
export type Citation = z.infer<typeof citationSchema>
export type CitedClaim = z.infer<typeof citedClaimSchema>
export type IntelligenceErrorBody = z.infer<typeof intelligenceErrorSchema>

export class IntelligenceApiError extends Error {
  readonly code: IntelligenceErrorBody['code'] | 'INVALID_ERROR_RESPONSE'
  readonly retryable: boolean
  readonly status: number

  constructor(
    message: string,
    status: number,
    code: IntelligenceApiError['code'],
    retryable: boolean,
  ) {
    super(message)
    this.name = 'IntelligenceApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

export const intelligenceErrorFromResponse = async (response: Response) => {
  try {
    const parsed = intelligenceErrorSchema.safeParse(await response.json())
    if (parsed.success) {
      return new IntelligenceApiError(
        parsed.data.error,
        response.status,
        parsed.data.code,
        parsed.data.retryable,
      )
    }
  } catch {
    // The fallback below avoids exposing untrusted or malformed server output.
  }

  return new IntelligenceApiError(
    'Intelligence is temporarily unavailable.',
    response.status,
    'INVALID_ERROR_RESPONSE',
    response.status >= 500 || response.status === 429,
  )
}
