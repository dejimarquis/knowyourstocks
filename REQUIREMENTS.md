# Know Your Stocks: Opinion Intelligence Requirements

## Product goal

Build a minimalist, beginner-first educational tool for researching US common stocks against a user-defined investment thesis. The product explains evidence and uncertainty; it is not a brokerage, return-prediction system, or personalized financial adviser.

## Core decisions

| Area | Requirement |
| --- | --- |
| Authoritative score | Deterministic 0–100 thesis Fit with visible factor evidence |
| AI output | Separate opinion intelligence; never a numeric AI score |
| Research/Discover model | `gpt-5-mini-intelligence` |
| Watchlist model | `gpt-oss-120b-intelligence` |
| Cleanup target | Keep GPT-5-mini and gpt-oss-120b; remove Phi deployments after live verification |
| Personal state | Browser-local; no accounts or cross-device sync |
| Model boundary | Strict request-specific JSON Schema plus server-side validation |
| Failure behavior | Retry transient failure once, then preserve deterministic fallback |

## Product principles

- Explain rather than dictate.
- Keep deterministic Fit separate, authoritative, and visible.
- Treat model output as optional, untrusted evidence synthesis.
- Never return an AI numeric score or describe Fit as a return prediction.
- Never show or request hidden chain-of-thought; show concise cited reasoning summaries.
- Show source, period, freshness, uncertainty, confidence, and missing data honestly.
- Never invent provider values, candidate symbols, evidence, numeric claims, or model output.
- Fall back to complete deterministic behavior when any provider or model step fails.

## Opinion output

The canonical opinion output is:

1. opinion;
2. concise reasoning summary;
3. why it fits;
4. concerns;
5. what to watch or research next;
6. uncertainty;
7. confidence; and
8. citations.

Research exposes all fields directly. Discover and Watchlist use equivalent operation-specific labels, including thesis rationale, main concern, what changed, overall summary, and next research/watch step.

All citations must map to evidence supplied in the same request. Hidden `reasoning_content` is ignored and is never stored or displayed.

## Research

When a stock result is visible, Research obtains provider evidence, selectively fills supported missing fundamentals from SEC EDGAR, normalizes values and provenance, calculates deterministic Fit, and may request a separate opinion.

The opinion must use one of `Fits thesis`, `Mixed`, `Weak fit`, or `Insufficient evidence` and return the complete cited output contract. A cached stock may reuse a matching six-hour opinion cache or request a new opinion when the cache is missing or expired.

## Discover

Discover is manual and must not spend provider or model calls on page load. It uses the curated liquid-US common-stock universe plus accepted peer context, excludes watched/current symbols, fetches at most eight candidates, and shows at most five.

The model may order only the supplied candidates and must return each exactly once with an opinion, thesis rationale, concern, next research step, confidence, and citations. Any invalid, unavailable, timed-out, or rate-limited response leaves deterministic Fit ordering and explanations available.

## Watchlist

The watchlist stores up to 25 stocks locally. A requested review persists the deterministic brief before model completion and assesses every supplied stock, including stable stocks.

Business-first signals cover Fit drift, growth, margins, cash flow, leverage, liquidity, valuation, filings, earnings, concentration, freshness, and supported context. There is no standalone daily-price-move alert.

Each model stock assessment includes an opinion, cited change summary, cited fit points, cited concerns, cited next-watch points, and confidence. Optional cross-stock patterns require at least two distinct supplied symbols. Invalid optional patterns may be dropped without failing a valid core review.

## Grounded API requirements

Research, Discover, and Watchlist share one Foundry client with operation-specific request validation and request-specific strict JSON Schema output.

Required controls:

- citation enums derived from the request's evidence IDs;
- symbol enums derived from the supplied Discover candidates or Watchlist stocks;
- `additionalProperties: false`, required fields, bounded arrays, and fixed enums;
- server-side citation existence, uniqueness, count, and symbol-attachment checks;
- exact candidate/stock coverage;
- generated-narrative digit and numeric-word rejection;
- invented numeric-claim, direct-advice, guarantee, and price-target rejection;
- optional invalid Watchlist pattern dropping;
- one bounded retry for timeout, HTTP 429, or server error;
- six-hour validated-response cache keyed by deployment, operation, schema, and request;
- deterministic fallback after every failure;
- visible `message.content` only; ignore hidden `reasoning_content`.

The global attempt cap is 12 seconds; current operation calls use 11 seconds. Process-local global and browser limits reduce bursts but are not durable spending ceilings.

## Model selection

### Selected route

- GPT-5-mini for Research and Discover.
- gpt-oss-120b for Watchlist.

GPT-5-mini delivered the strongest nuanced Research and Discover quality. The final concurrent run generated 24/24 Research and 20/20 Discover responses with strict grounding. Estimated cost was about $0.0018 and $0.0020 per call.

### Rejected or rollback choices

GPT-4.1-mini deployment creation was rejected because the requested Azure model version is deprecating in April 2027. It is not an appropriate new production dependency.

The earlier broad Watchlist schema was too slow on GPT-5-mini and could exhaust output on gpt-oss. The final bounded schema requires one concise fit, concern, and watch item per stock. gpt-oss-120b then generated 20/20 grounded strict responses with 4.725 quality, 11.732-second p95, and about $0.000487 per call.

Phi is not selected: both Phi-4-mini variants rejected the strict JSON Schema request, and JSON-mode probes timed out or returned invalid shapes. After live verification remove every Phi deployment and the legacy `FOUNDRY_DEPLOYMENT` setting; retain `gpt-5-mini-intelligence` and `gpt-oss-120b-intelligence`.

## Evaluation acceptance evidence

The production-derived dataset covers PLTR, CRWV, MSFT, Bloom Energy, Discover, and stable/changing Watchlist cases.

- GPT-5-mini Research: 24/24, quality 4.958, p95 15.031s under concurrency, about $0.001794/call.
- GPT-5-mini Discover: 20/20, quality 4.875, p95 18.046s under concurrency, about $0.002013/call.
- GPT-5-mini Watchlist: multi-stock reliability failed the concurrent release gate even after increasing capacity and allowing a 20-second attempt.
- gpt-oss-120b Watchlist: 20/20, quality 4.725, p95 11.732s, about $0.000487/call with the final concise strict schema.

Production retries the transient failure class represented by the single Research first-attempt timeout. Pricing is estimated from the public Azure catalog/calculator and is not contractual.

## Privacy

The structured thesis, optional note, watchlist, snapshots, Fits, briefs, and caches remain browser-local. A non-empty thesis note is included in an opinion request because it is part of the user's thesis context.

Packets contain compact supplied evidence and never contain the Finnhub key. Citations are mapped to that supplied evidence. Raw prompts and packets are not intentionally persisted server-side; validated responses may remain in the six-hour in-process cache. Hidden model reasoning is not displayed or stored.

## Validation

The current suite contains 66 frontend tests, 47 API tests, and 30 Playwright journeys. These are current suite counts, not deployment proof. Required validation also includes lint, builds, hands-on browser testing, app-setting checks, and live verification of all three operation routes, cache behavior, retry/fallback, citations, privacy disclosure, accessibility, and responsive layout.

Do not mark the routing deployed until app settings are validated, the change is deployed, each operation succeeds live, fallback and rollback are checked, and unused deployment cleanup is explicitly approved.

## Non-goals

- Brokerage, holdings, trading, portfolio accounting, or return prediction.
- Accounts or cross-device sync.
- Background reviews or notifications.
- Intraday streaming.
- Open-ended AI chat, autonomous actions, or ungrounded investment analysis.
- Durable application-level Foundry billing enforcement.
