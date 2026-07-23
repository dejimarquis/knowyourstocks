import { z } from 'zod'

export const sectors = [
  { id: 'ai', label: 'AI infrastructure' },
  { id: 'technology', label: 'Technology' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'energy', label: 'Energy' },
  { id: 'consumer', label: 'Consumer' },
] as const

export const investmentHorizons = [
  { id: 'one-to-three', label: '1 to 3 years' },
  { id: 'three-to-seven', label: '3 to 7 years' },
  { id: 'seven-plus', label: '7 years or more' },
] as const

export const riskProfiles = [
  { id: 'conservative', label: 'Prefer stability' },
  { id: 'balanced', label: 'Balance risk and growth' },
  { id: 'aggressive', label: 'Accept higher volatility' },
] as const

export const investmentStyles = [
  { id: 'quality', label: 'Quality businesses' },
  { id: 'growth', label: 'Long-term growth' },
  { id: 'value', label: 'Reasonable valuation' },
  { id: 'income', label: 'Income and dividends' },
] as const

const thesisSchema = z.object({
  version: z.literal(1),
  sectors: z.array(z.string()).max(4),
  horizon: z.enum(['one-to-three', 'three-to-seven', 'seven-plus']),
  risk: z.enum(['conservative', 'balanced', 'aggressive']),
  style: z.enum(['quality', 'growth', 'value', 'income']),
  note: z.string().max(500),
})

export type InvestmentThesis = z.infer<typeof thesisSchema>

export const defaultThesis: InvestmentThesis = {
  version: 1,
  sectors: ['ai', 'technology'],
  horizon: 'seven-plus',
  risk: 'balanced',
  style: 'quality',
  note: '',
}

export const parseThesis = (value: unknown): InvestmentThesis =>
  thesisSchema.parse(value)
