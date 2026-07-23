import type { SecuritySnapshot } from '../data/alphaVantage'
import { sectors, type InvestmentThesis } from '../domain/thesis'

export type FitFactor = {
  key: string
  label: string
  earned: number
  maximum: number
  evidence: string
  available: boolean
}

export type FitScore = {
  total: number | null
  label: 'Strong match' | 'Moderate match' | 'Limited match' | 'Insufficient data'
  factors: FitFactor[]
  missing: string[]
}

const includesAny = (value: string, terms: string[]) =>
  terms.some((term) => value.includes(term))

const themeTerms: Record<string, string[]> = {
  ai: ['artificial intelligence', 'semiconductor', 'software', 'cloud', 'technology'],
  technology: ['technology', 'software', 'semiconductor', 'information technology'],
  manufacturing: ['manufacturing', 'industrials', 'machinery', 'aerospace'],
  healthcare: ['healthcare', 'biotechnology', 'pharmaceutical', 'medical'],
  energy: ['energy', 'oil', 'gas', 'renewable', 'utilities'],
  consumer: ['consumer', 'retail', 'restaurant', 'apparel'],
}

const sectorFactor = (
  security: SecuritySnapshot,
  thesis: InvestmentThesis,
): FitFactor => {
  const classification = `${security.sector ?? ''} ${security.industry ?? ''}`.toLowerCase()

  if (!classification.trim()) {
    return {
      key: 'sector',
      label: 'Sector and theme alignment',
      earned: 0,
      maximum: 20,
      evidence: 'Sector classification is unavailable.',
      available: false,
    }
  }

  const matched = thesis.sectors.filter((sector) =>
    includesAny(classification, themeTerms[sector] ?? []),
  )
  const matchedLabels = sectors
    .filter((sector) => matched.includes(sector.id))
    .map((sector) => sector.label)
  const earned = matched.length > 0 ? 20 : 4

  return {
    key: 'sector',
    label: 'Sector and theme alignment',
    earned,
    maximum: 20,
    evidence:
      matched.length > 0
        ? `${security.sector ?? security.industry} aligns with ${matchedLabels.join(', ')}.`
        : `${security.sector ?? security.industry} is outside the selected themes.`,
    available: true,
  }
}

const riskFactor = (
  security: SecuritySnapshot,
  thesis: InvestmentThesis,
): FitFactor => {
  if (security.beta === null) {
    return {
      key: 'risk',
      label: 'Risk-profile alignment',
      earned: 0,
      maximum: 20,
      evidence: 'Beta is unavailable.',
      available: false,
    }
  }

  let earned = 0

  if (thesis.risk === 'conservative') {
    earned = security.beta <= 0.9 ? 20 : security.beta <= 1.1 ? 14 : 5
  } else if (thesis.risk === 'balanced') {
    earned = security.beta <= 1.3 ? 18 : security.beta <= 1.6 ? 12 : 6
  } else {
    earned = security.beta >= 1.1 ? 18 : 14
  }

  return {
    key: 'risk',
    label: 'Risk-profile alignment',
    earned,
    maximum: 20,
    evidence: `Beta is ${security.beta.toFixed(2)} compared with the market baseline of 1.00.`,
    available: true,
  }
}

const qualityFactor = (security: SecuritySnapshot): FitFactor => {
  const values = [
    security.profitMargin,
    security.returnOnEquity,
    security.eps,
  ].filter((value): value is number => value !== null)

  if (values.length < 2) {
    return {
      key: 'quality',
      label: 'Fundamental quality',
      earned: 0,
      maximum: 20,
      evidence: 'Too few profitability metrics are available.',
      available: false,
    }
  }

  const marginPoints =
    security.profitMargin === null
      ? 0
      : security.profitMargin >= 0.15
        ? 8
        : security.profitMargin > 0
          ? 5
          : 0
  const returnPoints =
    security.returnOnEquity === null
      ? 0
      : security.returnOnEquity >= 0.2
        ? 7
        : security.returnOnEquity > 0.08
          ? 4
          : 0
  const earningsPoints = security.eps === null ? 0 : security.eps > 0 ? 5 : 0

  return {
    key: 'quality',
    label: 'Fundamental quality',
    earned: marginPoints + returnPoints + earningsPoints,
    maximum: 20,
    evidence: `Profit margin is ${formatPercent(security.profitMargin)} and return on equity is ${formatPercent(security.returnOnEquity)}.`,
    available: true,
  }
}

const growthFactor = (security: SecuritySnapshot): FitFactor => {
  if (security.revenueGrowth === null && security.earningsGrowth === null) {
    return {
      key: 'growth',
      label: 'Horizon and growth alignment',
      earned: 0,
      maximum: 15,
      evidence: 'Recent revenue and earnings growth are unavailable.',
      available: false,
    }
  }

  const growthPoints = (value: number | null) =>
    value === null ? 0 : value >= 0.15 ? 7.5 : value > 0 ? 5 : 0

  return {
    key: 'growth',
    label: 'Horizon and growth alignment',
    earned:
      growthPoints(security.revenueGrowth) +
      growthPoints(security.earningsGrowth),
    maximum: 15,
    evidence: `Quarterly revenue growth is ${formatPercent(security.revenueGrowth)} and earnings growth is ${formatPercent(security.earningsGrowth)}.`,
    available: true,
  }
}

const resilienceFactor = (security: SecuritySnapshot): FitFactor => {
  if (security.marketCap === null && security.profitMargin === null) {
    return {
      key: 'resilience',
      label: 'Financial resilience',
      earned: 0,
      maximum: 10,
      evidence: 'Resilience inputs are unavailable.',
      available: false,
    }
  }

  const sizePoints =
    security.marketCap === null
      ? 0
      : security.marketCap >= 10_000_000_000
        ? 5
        : security.marketCap >= 2_000_000_000
          ? 3
          : 1
  const marginPoints =
    security.profitMargin === null ? 0 : security.profitMargin > 0 ? 5 : 0

  return {
    key: 'resilience',
    label: 'Financial resilience',
    earned: sizePoints + marginPoints,
    maximum: 10,
    evidence: `Market cap is ${formatCompactCurrency(security.marketCap)} with a ${formatPercent(security.profitMargin)} profit margin.`,
    available: true,
  }
}

const valuationFactor = (
  security: SecuritySnapshot,
  thesis: InvestmentThesis,
): FitFactor => {
  if (security.peRatio === null) {
    return {
      key: 'valuation',
      label: 'Valuation preference',
      earned: 0,
      maximum: 10,
      evidence: 'Price-to-earnings data is unavailable.',
      available: false,
    }
  }

  const idealByStyle = {
    quality: 35,
    growth: 50,
    value: 25,
    income: 30,
  } as const
  const ideal = idealByStyle[thesis.style]
  const earned =
    security.peRatio <= ideal
      ? 10
      : security.peRatio <= ideal * 1.4
        ? 7
        : 3

  return {
    key: 'valuation',
    label: 'Valuation preference',
    earned,
    maximum: 10,
    evidence: `Trailing price-to-earnings ratio is ${security.peRatio.toFixed(1)}.`,
    available: true,
  }
}

const preferenceFactor = (
  security: SecuritySnapshot,
  thesis: InvestmentThesis,
): FitFactor => {
  let matched = false
  let evidence = 'The selected style has limited supporting data.'

  if (thesis.style === 'income' && security.dividendYield !== null) {
    matched = security.dividendYield >= 0.02
    evidence = `Dividend yield is ${formatPercent(security.dividendYield)}.`
  } else if (thesis.style === 'growth' && security.revenueGrowth !== null) {
    matched = security.revenueGrowth >= 0.1
    evidence = `Quarterly revenue growth is ${formatPercent(security.revenueGrowth)}.`
  } else if (thesis.style === 'quality' && security.profitMargin !== null) {
    matched = security.profitMargin >= 0.1
    evidence = `Profit margin is ${formatPercent(security.profitMargin)}.`
  } else if (thesis.style === 'value' && security.peRatio !== null) {
    matched = security.peRatio <= 25
    evidence = `Trailing price-to-earnings ratio is ${security.peRatio.toFixed(1)}.`
  }

  return {
    key: 'preference',
    label: 'Explicit style preference',
    earned: matched ? 5 : 2,
    maximum: 5,
    evidence,
    available: true,
  }
}

const formatPercent = (value: number | null) =>
  value === null
    ? 'unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value)

const formatCompactCurrency = (value: number | null) =>
  value === null
    ? 'unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value)

export const scoreSecurity = (
  security: SecuritySnapshot,
  thesis: InvestmentThesis,
): FitScore => {
  const factors = [
    sectorFactor(security, thesis),
    riskFactor(security, thesis),
    qualityFactor(security),
    growthFactor(security),
    resilienceFactor(security),
    valuationFactor(security, thesis),
    preferenceFactor(security, thesis),
  ]
  const availableMaximum = factors
    .filter((factor) => factor.available)
    .reduce((sum, factor) => sum + factor.maximum, 0)
  const missing = factors
    .filter((factor) => !factor.available)
    .map((factor) => factor.label)

  if (availableMaximum < 70) {
    return {
      total: null,
      label: 'Insufficient data',
      factors,
      missing,
    }
  }

  const earned = factors.reduce((sum, factor) => sum + factor.earned, 0)
  const total = Math.round((earned / availableMaximum) * 100)

  return {
    total,
    label:
      total >= 75
        ? 'Strong match'
        : total >= 55
          ? 'Moderate match'
          : 'Limited match',
    factors,
    missing,
  }
}
