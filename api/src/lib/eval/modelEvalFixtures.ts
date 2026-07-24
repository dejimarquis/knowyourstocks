export type EvalEvidence = {
  id: string
  symbol: string
  fact: string
}

type BaseFixture = {
  id: string
  thesis: string
  evidence: EvalEvidence[]
}

export type ResearchEvalFixture = BaseFixture & {
  operation: 'research'
  symbol: string
  expected: {
    scoreBand: [number, number]
    opinions: string[]
    requiredEvidenceIds: string[]
    confidence?: 'low' | 'medium' | 'high'
  }
}

export type RecommendationEvalFixture = BaseFixture & {
  operation: 'recommendations'
  candidates: string[]
  expected: {
    topSymbols: string[]
    omittedSymbols: string[]
  }
}

export type WatchlistEvalFixture = BaseFixture & {
  operation: 'watchlist'
  symbols: string[]
  expected: {
    priorityEvidenceIds: string[]
    assessmentSymbols: string[]
  }
}

export type ModelEvalFixture =
  | ResearchEvalFixture
  | RecommendationEvalFixture
  | WatchlistEvalFixture

export const modelEvalDataset = {
  version: 'foundry-mini-eval.v1.2026-07-23',
  fixtures: [
    {
      id: 'research-quality-expensive',
      operation: 'research',
      symbol: 'MSFT',
      thesis: 'Long-term quality AI exposure with balanced risk.',
      evidence: [
        { id: 'e1', symbol: 'MSFT', fact: 'Technology and cloud align with the AI thesis.' },
        { id: 'e2', symbol: 'MSFT', fact: 'Profit margin is strong and return on equity is high.' },
        { id: 'e3', symbol: 'MSFT', fact: 'Revenue and EPS growth are positive.' },
        { id: 'e4', symbol: 'MSFT', fact: 'Free cash flow is positive.' },
        { id: 'e5', symbol: 'MSFT', fact: 'Valuation is above the quality-style target.' },
      ],
      expected: {
        scoreBand: [68, 88],
        opinions: ['Compelling', 'Promising but mixed'],
        requiredEvidenceIds: ['e2', 'e5'],
        confidence: 'high',
      },
    },
    {
      id: 'research-growth-unprofitable',
      operation: 'research',
      symbol: 'GROW',
      thesis: 'Long-term growth with balanced risk and durable cash flow.',
      evidence: [
        { id: 'e1', symbol: 'GROW', fact: 'Revenue growth is very strong.' },
        { id: 'e2', symbol: 'GROW', fact: 'Profit and operating margins are negative.' },
        { id: 'e3', symbol: 'GROW', fact: 'Free cash flow is negative.' },
        { id: 'e4', symbol: 'GROW', fact: 'Beta is well above the balanced-risk range.' },
        { id: 'e5', symbol: 'GROW', fact: 'Earnings growth is unavailable.' },
      ],
      expected: {
        scoreBand: [28, 58],
        opinions: ['Watch closely', 'Reconsider'],
        requiredEvidenceIds: ['e1', 'e2', 'e3'],
        confidence: 'medium',
      },
    },
    {
      id: 'research-value-deteriorating',
      operation: 'research',
      symbol: 'VALUE',
      thesis: 'Value investing with conservative risk.',
      evidence: [
        { id: 'e1', symbol: 'VALUE', fact: 'P/E is below the value target.' },
        { id: 'e2', symbol: 'VALUE', fact: 'Revenue and earnings growth are negative.' },
        { id: 'e3', symbol: 'VALUE', fact: 'Debt to equity increased materially.' },
        { id: 'e4', symbol: 'VALUE', fact: 'Current ratio is below one.' },
        { id: 'e5', symbol: 'VALUE', fact: 'Free cash flow remains positive but declined.' },
      ],
      expected: {
        scoreBand: [25, 52],
        opinions: ['Watch closely', 'Reconsider'],
        requiredEvidenceIds: ['e1', 'e2', 'e3'],
        confidence: 'high',
      },
    },
    {
      id: 'research-incomplete',
      operation: 'research',
      symbol: 'NEW',
      thesis: 'Long-term manufacturing growth with balanced risk.',
      evidence: [
        { id: 'e1', symbol: 'NEW', fact: 'Industry aligns with manufacturing.' },
        { id: 'e2', symbol: 'NEW', fact: 'Revenue growth is positive.' },
        { id: 'e3', symbol: 'NEW', fact: 'Margin, cash flow, debt, and valuation data are unavailable.' },
        { id: 'e4', symbol: 'NEW', fact: 'Only one reporting period is available.' },
      ],
      expected: {
        scoreBand: [25, 60],
        opinions: ['Watch closely'],
        requiredEvidenceIds: ['e3', 'e4'],
        confidence: 'low',
      },
    },
    {
      id: 'recommendations-ai-quality',
      operation: 'recommendations',
      thesis: 'Long-term quality AI exposure with balanced risk.',
      candidates: ['MSFT', 'GOOGL', 'NVDA', 'TSM', 'IBM', 'XOM'],
      evidence: [
        { id: 'e1', symbol: 'MSFT', fact: 'Strong margins, cash flow, and AI-aligned cloud exposure.' },
        { id: 'e2', symbol: 'GOOGL', fact: 'Strong cash flow, AI exposure, and moderate valuation.' },
        { id: 'e3', symbol: 'NVDA', fact: 'Very strong growth and AI alignment with high valuation and volatility.' },
        { id: 'e4', symbol: 'TSM', fact: 'AI semiconductor exposure with geopolitical concentration risk.' },
        { id: 'e5', symbol: 'IBM', fact: 'Quality cash flow and AI exposure with slower growth.' },
        { id: 'e6', symbol: 'XOM', fact: 'Strong cash flow but outside the selected AI and technology themes.' },
      ],
      expected: { topSymbols: ['MSFT', 'GOOGL'], omittedSymbols: ['XOM'] },
    },
    {
      id: 'recommendations-manufacturing',
      operation: 'recommendations',
      thesis: 'Long-term manufacturing and industrial automation with balanced risk.',
      candidates: ['ETN', 'HON', 'CAT', 'ROK', 'TSLA', 'PFE'],
      evidence: [
        { id: 'e1', symbol: 'ETN', fact: 'Electrification and industrial exposure with strong margins.' },
        { id: 'e2', symbol: 'HON', fact: 'Diversified industrial automation exposure and positive cash flow.' },
        { id: 'e3', symbol: 'CAT', fact: 'Manufacturing alignment with cyclical demand risk.' },
        { id: 'e4', symbol: 'ROK', fact: 'Direct factory automation exposure with moderate growth.' },
        { id: 'e5', symbol: 'TSLA', fact: 'Manufacturing exposure with high volatility and valuation.' },
        { id: 'e6', symbol: 'PFE', fact: 'Healthcare company outside the manufacturing thesis.' },
      ],
      expected: { topSymbols: ['ETN', 'HON'], omittedSymbols: ['PFE'] },
    },
    {
      id: 'recommendations-healthcare',
      operation: 'recommendations',
      thesis: 'Long-term healthcare quality with conservative risk.',
      candidates: ['JNJ', 'ABBV', 'LLY', 'ISRG', 'UNH', 'CVX'],
      evidence: [
        { id: 'e1', symbol: 'JNJ', fact: 'Diversified healthcare, lower beta, and positive cash flow.' },
        { id: 'e2', symbol: 'ABBV', fact: 'Strong cash flow and income with product concentration risk.' },
        { id: 'e3', symbol: 'LLY', fact: 'Strong growth and margins with expensive valuation.' },
        { id: 'e4', symbol: 'ISRG', fact: 'Healthcare technology quality with expensive valuation.' },
        { id: 'e5', symbol: 'UNH', fact: 'Healthcare scale and cash flow with policy risk.' },
        { id: 'e6', symbol: 'CVX', fact: 'Energy company outside the healthcare thesis.' },
      ],
      expected: { topSymbols: ['JNJ', 'ABBV'], omittedSymbols: ['CVX'] },
    },
    {
      id: 'recommendations-diversification',
      operation: 'recommendations',
      thesis: 'Quality growth with less technology concentration.',
      candidates: ['BRK.B', 'JNJ', 'COST', 'XOM', 'MSFT', 'NVDA'],
      evidence: [
        { id: 'e1', symbol: 'BRK.B', fact: 'Diversified non-technology cash-generating businesses.' },
        { id: 'e2', symbol: 'JNJ', fact: 'Healthcare diversification with lower beta.' },
        { id: 'e3', symbol: 'COST', fact: 'Consumer quality and durable cash flow.' },
        { id: 'e4', symbol: 'XOM', fact: 'Energy diversification with commodity cyclicality.' },
        { id: 'e5', symbol: 'MSFT', fact: 'High quality but adds technology concentration.' },
        { id: 'e6', symbol: 'NVDA', fact: 'Strong growth but adds semiconductor concentration and volatility.' },
      ],
      expected: { topSymbols: ['BRK.B', 'JNJ', 'COST'], omittedSymbols: ['NVDA'] },
    },
    {
      id: 'watchlist-stable',
      operation: 'watchlist',
      thesis: 'Long-term quality technology with balanced risk.',
      symbols: ['MSFT', 'GOOGL'],
      evidence: [
        { id: 'e1', symbol: 'MSFT', fact: 'Fit, margins, growth, cash flow, and valuation are materially unchanged.' },
        { id: 'e2', symbol: 'GOOGL', fact: 'Fit, margins, growth, cash flow, and valuation are materially unchanged.' },
        { id: 'e3', symbol: 'MSFT', fact: 'No near-term earnings event is present.' },
        { id: 'e4', symbol: 'GOOGL', fact: 'No near-term earnings event is present.' },
      ],
      expected: {
        priorityEvidenceIds: [],
        assessmentSymbols: ['MSFT', 'GOOGL'],
      },
    },
    {
      id: 'watchlist-deterioration',
      operation: 'watchlist',
      thesis: 'Long-term quality growth with balanced risk.',
      symbols: ['GOOD', 'DRIFT'],
      evidence: [
        { id: 'e1', symbol: 'GOOD', fact: 'Fundamentals and thesis fit are stable.' },
        { id: 'e2', symbol: 'DRIFT', fact: 'Free cash flow declined materially.' },
        { id: 'e3', symbol: 'DRIFT', fact: 'Debt to equity increased and liquidity weakened.' },
        { id: 'e4', symbol: 'DRIFT', fact: 'Thesis-fit score fell into limited-match range.' },
      ],
      expected: {
        priorityEvidenceIds: ['e2', 'e3', 'e4'],
        assessmentSymbols: ['GOOD', 'DRIFT'],
      },
    },
    {
      id: 'watchlist-earnings',
      operation: 'watchlist',
      thesis: 'Long-term growth with balanced risk.',
      symbols: ['REPORT', 'STABLE'],
      evidence: [
        { id: 'e1', symbol: 'REPORT', fact: 'Earnings are expected within three days.' },
        { id: 'e2', symbol: 'REPORT', fact: 'Margin and cash-flow data are incomplete.' },
        { id: 'e3', symbol: 'REPORT', fact: 'Revenue growth remains strong.' },
        { id: 'e4', symbol: 'STABLE', fact: 'No material business change is present.' },
      ],
      expected: {
        priorityEvidenceIds: ['e1', 'e2'],
        assessmentSymbols: ['REPORT', 'STABLE'],
      },
    },
    {
      id: 'watchlist-concentration',
      operation: 'watchlist',
      thesis: 'Long-term AI exposure without excessive concentration.',
      symbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'JNJ'],
      evidence: [
        { id: 'e1', symbol: 'watchlist', fact: 'Four of five positions are semiconductor companies.' },
        { id: 'e2', symbol: 'NVDA', fact: 'Strong growth with high valuation.' },
        { id: 'e3', symbol: 'AMD', fact: 'AI exposure with weaker margins than the group leader.' },
        { id: 'e4', symbol: 'AVGO', fact: 'Strong cash flow with semiconductor concentration.' },
        { id: 'e5', symbol: 'TSM', fact: 'Semiconductor exposure with geopolitical risk.' },
        { id: 'e6', symbol: 'JNJ', fact: 'Healthcare position provides limited diversification.' },
      ],
      expected: {
        priorityEvidenceIds: ['e1'],
        assessmentSymbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'JNJ'],
      },
    },
  ] satisfies ModelEvalFixture[],
}
