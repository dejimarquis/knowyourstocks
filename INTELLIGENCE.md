# Grounded intelligence v2

## Authority model

Deterministic code is authoritative for:

- normalized market and filing values;
- metric provenance and freshness;
- thesis Fit and factor contributions;
- Watchlist signal coverage and severity;
- candidate membership and exclusions;
- fallback ranking and explanations.

Azure Foundry is a separate, best-effort evidence reviewer. It can score how strongly supplied evidence supports a thesis, rank only supplied Discover candidates, assess each supplied Watchlist stock, prioritize verified signals, and connect verified cross-stock evidence. It cannot create market facts, change deterministic values, predict returns, or issue trade instructions.

## User-trigger contract

AI runs only after:

- an explicit Research Search or Refresh;
- an explicit Discover refresh;
- a requested Watchlist review when Phi is enabled.

Cached page load does not call AI. The deterministic result is available independently of model success.

## Operation contracts

### Research

Research keeps deterministic Fit and AI assessment separate. The AI response contains:

- 0–100 thesis-evidence score;
- opinion: `Compelling`, `Promising but mixed`, `Watch closely`, or `Reconsider`;
- concise summary;
- one to three grounded strengths;
- one to three grounded risks or gaps;
- low, medium, or high confidence.

The score measures evidence support, not expected returns.

### Discover

Discover manually builds a hybrid candidate set from a curated liquid-US common-stock universe plus Finnhub peer context. Watched and current symbols are excluded; peers outside the curated universe are ignored. At most eight candidates are fetched and at most five are shown. ETFs are not included initially.

When exactly five valid candidates exist, Phi must rank exactly those supplied five. An invalid or unavailable response leaves the deterministic Fit ranking and explanations in place.

### Watchlist

Deterministic review signals prioritize business evidence: growth, margins, cash flow, leverage, liquidity, valuation, filings, earnings, thesis drift, concentration, freshness, and supported context. There is no standalone daily-move alert; price movement can only supplement a business or event signal.

Watchlist v2 supplies compact current and previous evidence for every stock. A valid model response must assess every supplied stock exactly once, including stable stocks. It may also prioritize verified evidence and return up to three cross-stock patterns grounded in at least two distinct symbols.

The UI records `not_requested`, `loading`, `generated`, `fallback`, `disabled`, or `rate_limited`. Every non-generated state preserves the deterministic brief.

## Shared API guardrails

All three operations use `groundedIntelligence.ts`:

- operation-specific Zod input/output schemas;
- compact evidence aliases;
- exact supplied-symbol validation;
- evidence existence, uniqueness, count, and symbol-attachment validation;
- cross-stock distinct-symbol validation;
- JSON extraction and normalization for known harmless schema variants;
- rejection of direct advice, guarantees, price targets, and invented numeric claims;
- temperature zero and JSON response mode;
- bounded output tokens: Research 360, Discover 450, Watchlist 1600;
- one retry for timeout, HTTP 429, or HTTP 5xx;
- six-hour in-process response cache keyed by deployment, operation, and request;
- default 25-second timeout per attempt;
- default process-local windows of 500 global and 10 per browser;
- HTTP 429/400/503 mapping and deterministic fallback.

The process-local windows are burst controls, not durable quota enforcement. Cold starts and scale-out can reset them.

## Model bake-off

The frozen evaluation set covered Research, recommendations, and Watchlist. **Phi-4-mini-instruct** was selected as the one global model, using deployment `phi-4-mini-watchlist`.

Observed results:

- Phi-4-mini-reasoning was stronger on some Research reasoning cases.
- Its observed chunks took roughly 39–54 seconds.
- It produced malformed recommendation structures and confused evidence IDs with symbols.
- Its aggregate reliability was lower.
- Phi-4-mini-instruct produced usable successful latency around 2.6–8.6 seconds.
- Instruct grounded recommendation and Watchlist tasks better.
- Instruct still had intermittent low-capacity serverless timeouts.
- Neither model met the aspirational 95% raw-schema-validity gate.

The selection therefore reflects end-to-end reliability under the application's normalization and validation layer. It does not justify trusting raw model output. Normalization, evidence checks, bounded retries, caching, rate limits, and deterministic fallback remain mandatory.

## Data supplied to the model

Finnhub now contributes corrected `epsGrowthTTMYoy`, operating margin, free cash flow, debt-to-equity, and current ratio. Evidence includes metric-level source, as-of date when known, and period. SEC fills only supported missing values and carries filing-date provenance.

Research, Discover, and Watchlist automatically include any non-empty free-text thesis note after the user explicitly triggers the AI operation. Passive page loads do not send it. No operation receives the Finnhub key or raw provider payloads.

## Cost and failure behavior

The selected deployment remains low capacity. The $25 Azure budget is an alert and does not block inference.

Azure Table quota code, the storage SDK dependency, quota Bicep module, post-provision configuration hook, and durable monthly hard-stop behavior were removed. Runtime resilience now depends on:

- bounded packets and output tokens;
- browser and server caches;
- process-local rate limits;
- short timeouts;
- one bounded transient retry;
- graceful handling of HTTP 429 and serverless timeout;
- deterministic fallback.

Because the budget is not a hard stop and limits are process-local, usage must be monitored rather than described as guaranteed below a fixed call count.

## Deployment and cleanup state

Intelligence v2 is locally implemented but must complete hands-on browser testing and formal validation before push or deployment.

Keep:

- Static Web Apps;
- the Foundry account;
- `phi-4-mini-watchlist`;
- the $25 budget.

Cleanup candidates after production verification and explicit destructive confirmation:

- `sthqjzjkf5lnc4k`;
- `INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING`;
- `FOUNDRY_MAX_MONTHLY_CALLS`;
- `phi-4-mini-reasoning-watchlist`;
- `phi-4-reasoning-watchlist`;
- `phi-4-watchlist`;
- attached monitoring/project resources only after dependency verification.
