# Security and privacy

## Finnhub API key

Know Your Stocks does not receive or store a user's Finnhub key.

- The key is stored in browser `sessionStorage`.
- It is sent directly from the browser to Finnhub.
- It is not committed, bundled, sent to Azure, or intentionally logged.
- Session restore behavior can preserve it after a crash or restart.

`sessionStorage` is not an encrypted vault. Same-origin JavaScript, a privileged browser extension, or compromised device software could read it. The app therefore loads no ads, analytics, or remote scripts and uses a restrictive Content Security Policy.

Normalized market snapshots may be cached in browser `localStorage` for six hours. Those caches contain market data, not the Finnhub key.

## SEC fallback

The same-origin SEC endpoint receives a public ticker symbol. It does not receive the Finnhub key, thesis, watchlist, or intelligence client identifier. SEC values are normalized and attached only to supported missing metrics with filing-date provenance.

## Browser-local personal data

The structured thesis, optional note, watchlist, snapshots, Fits, briefs, cached Research assessments, cached Discover results, model statuses, and feedback remain in browser storage. Clearing browser data or changing devices loses them.

Do not enter account numbers, holdings, passwords, or other sensitive financial information in the optional thesis note.

## AI request behavior

The application calls Azure Foundry in these cases:

- a Research result is visible and no matching six-hour AI cache exists, including a restored cached stock;
- Discover **Refresh ideas**;
- Watchlist **Review**, when Phi is enabled.

Discover does not run on page load. Watchlist does not run without Review. Research reuses a matching AI cache first and requests a new take only when needed.

## Intelligence packets

All intelligence packets exclude the Finnhub key and raw provider responses.

### Research

Research sends:

- symbol, company name, sector, and industry;
- structured thesis sectors, horizon, risk, and style;
- deterministic Fit total and label;
- compact metric and Fit evidence with source/period provenance.

Any non-empty free-text thesis note is sent automatically when Research AI is requested. This can occur after Search/Refresh or when a cached stock is restored without a matching AI cache.

### Discover

Discover sends exactly the supplied candidate set being ranked, with:

- symbol and company name;
- structured thesis fields;
- deterministic Fit context;
- compact candidate evidence and selected normalized metrics.

Any non-empty free-text thesis note is sent automatically after the user explicitly refreshes Discover. The model cannot add a symbol outside the supplied candidates.

### Watchlist

Watchlist v2 sends the watched stock inventory because every requested review must assess every stock, including stable stocks. The compact packet contains:

- symbol, name, sector, and industry;
- current and previous selected fundamentals;
- deterministic Fit factors and current/previous evidence;
- freshness, earnings, concentration, signal, and supported sentiment context;
- deterministic signals;
- structured thesis fields;
- any non-empty free-text thesis note.

The app does not intentionally persist raw packets or prompts server-side. The shared API keeps only a six-hour in-process cache of validated normalized responses keyed by a request hash and logs coarse status/error information.

## Untrusted-model controls

Foundry output is never authoritative market data. The shared API:

- validates operation-specific request and response schemas;
- normalizes limited known output variants;
- resolves aliases only to supplied evidence;
- rejects unknown, duplicate, insufficient, excessive, or misattached evidence;
- requires recommendation symbols to come from the supplied set;
- requires one Watchlist assessment per supplied stock;
- requires cross-stock evidence from at least two distinct symbols;
- rejects direct trade language, price targets, guarantees, and invented numeric claims;
- retries only bounded transient failures;
- falls back to deterministic output on timeout, HTTP 429, server error, malformed JSON, or validation failure.

No AI score predicts returns or changes deterministic Fit, signal severity, metric values, or source dates.

## Client identifier and rate limits

A random intelligence client identifier is stored in browser `localStorage` and sent to the intelligence endpoints. It supports process-local per-browser limits. It is not an account identifier, is not derived from an IP address, and is no longer hashed into Azure Table quota records.

The current API also maintains a process-local global daily window. These limits can reset during cold starts or scale-out, so they reduce bursts but do not provide a durable spend ceiling.

## Server credentials and cost controls

Foundry endpoint, deployment, and API key settings are held in Azure Static Web Apps application settings and are not returned to the browser or committed to the repository.

Azure Table quota code and IaC have been removed. The current code does not require `INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING` or `FOUNDRY_MAX_MONTHLY_CALLS`. If those settings remain live, they are cleanup candidates rather than active security controls.

The $25 Azure budget is alert-only. It does not stop Foundry requests. Safety and cost controls are low serverless capacity, bounded tokens, six-hour caches, process-local limits, short timeouts, bounded retry behavior, and deterministic fallback.

## Destructive cleanup

Do not delete the live quota Storage account, obsolete settings, losing model deployments, or attached monitoring/project resources until dependencies are verified and explicit destructive confirmation is obtained. See `.azure/deployment-plan.md` and `DECISIONS.md`.
