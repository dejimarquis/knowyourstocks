# Decision log

This file records current intelligence-v2 choices, tradeoffs, and deferred cleanup.

## Deterministic Fit remains authoritative

Fit is calculated from normalized evidence with visible factor contributions. AI has a separate thesis-evidence score and opinion. Neither score predicts returns, and AI cannot alter Fit, provider values, signal severity, candidate membership, or freshness.

This separation keeps the product explainable and ensures model failure never removes the core research result.

## Finnhub fundamentals are normalized with provenance

Finnhub `epsGrowthTTMYoy` is now the earnings-growth source. Operating margin, free cash flow, debt-to-equity, and current ratio were added. Percentage and currency-unit conversions occur in the adapter, and each available metric carries source and period metadata.

SEC EDGAR remains a selective missing-fundamentals fallback. It does not overwrite available provider values or supply quotes.

## AI requires an explicit user action

Research Search/Refresh, Discover refresh, and requested Watchlist review are the only AI triggers. Loading cached Research or Discover state does not spend model quota.

Matching six-hour caches may satisfy a request after an explicit action. This preserves responsiveness without turning passive browsing into model usage.

## Discover is a manual hybrid shortlist

Discover combines a versioned curated universe of liquid US common stocks with Finnhub peer context. Peer symbols influence priority only when they are already in the curated universe. The current and watched symbols are excluded, no more than eight candidates are fetched, and no more than five are shown.

ETFs are deferred from the initial universe. Deterministic Fit provides the fallback ranking whenever provider coverage is partial or model output is unavailable or invalid.

## Watchlist attention is business-first

The review engine emphasizes growth, margins, cash flow, leverage, liquidity, valuation, filings, earnings, thesis drift, concentration, freshness, and supported context. A daily price move is not a standalone alert; it can appear only as context on another signal.

Every requested Phi review receives evidence for every watched stock, including stable stocks, and must return one assessment per stock. This avoids equating “no deterministic change” with “not reviewed.”

Automatic Finnhub news-sentiment refresh is disabled because the optional endpoint returns HTTP 403 for common free personal keys. Previously stored sentiment remains readable, and sentiment can return when a licensed source is available.

## One shared grounded API protects all operations

Research, recommendations, and Watchlist share operation-specific schemas, output normalization, evidence alias resolution, symbol attachment checks, advice and numeric-claim guards, bounded retry, six-hour process cache, process-local rate limits, timeouts, token ceilings, and deterministic fallback.

Normalization is deliberately limited to harmless structural variants. It does not excuse unknown evidence, invented symbols, or unsupported claims.

## Phi-4-mini-instruct is the single global winner

The bake-off selected `phi-4-mini-watchlist` for all three operations.

Phi-4-mini-reasoning was stronger on some Research reasoning cases, but observed chunks took roughly 39–54 seconds. It also returned malformed recommendation structures, confused evidence IDs with symbols, and had lower aggregate reliability.

Phi-4-mini-instruct produced usable successful responses around 2.6–8.6 seconds and grounded recommendation and Watchlist work better, although low-capacity serverless inference still timed out intermittently.

Neither model met the aspirational 95% raw-schema-validity gate. The decision is therefore contingent on mandatory normalization, strict validation, bounded retry, caching, rate limits, and deterministic fallback.

## Durable Azure Table quota enforcement was removed

The Azure Table SDK, quota runtime, quota Bicep module, post-provision hook, and associated hard-stop behavior were removed. The current architecture no longer stores monthly or browser counters in Azure Table Storage.

The $25 Azure budget remains useful as an alert, but it is not a Foundry circuit breaker. Current controls are low model capacity, bounded tokens, six-hour caches, process-local limits, short timeouts, one transient retry, and fallback. These reduce risk but do not guarantee a fixed monthly call ceiling because processes can restart or scale.

## Local-first privacy has explicit AI exceptions

The thesis, watchlist, snapshots, briefs, and caches remain browser-local. The Finnhub key remains in `sessionStorage` and never enters intelligence APIs.

After an explicit AI action, structured thesis fields and compact evidence are sent to Foundry. Research and Discover omit the free-text note. Watchlist includes the note only after separate opt-in. Watchlist v2 necessarily includes the watched symbols and compact current/previous evidence so every stock can be assessed.

## Azure deployment remains intentionally small

Keep the Azure Static Web App, Foundry account, winning `phi-4-mini-watchlist` deployment, and $25 budget alert. The selected deployment should remain low capacity during the friend beta.

Intelligence v2 is not considered deployed until local hands-on browser testing, automated validation, push, deployment, and live verification are complete.

## Live cleanup requires a separate destructive step

Current candidates:

- Storage account `sthqjzjkf5lnc4k`;
- Static Web Apps settings `INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING` and `FOUNDRY_MAX_MONTHLY_CALLS`;
- losing deployments `phi-4-mini-reasoning-watchlist`, `phi-4-reasoning-watchlist`, and `phi-4-watchlist`.

The attached monitoring/project chain may also be removable, but only after dependency verification. Do not remove any candidate until the winning deployment is live-verified and explicit destructive confirmation is obtained.

## Deferred work

Accounts, cross-device sync, background notifications, centrally licensed shared market data, ETF discovery, durable distributed model quotas, authenticated managed identity, and multi-region infrastructure remain deferred until usage justifies their cost and complexity.
