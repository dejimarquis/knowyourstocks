# Know Your Stocks: Intelligence v2 Requirements

## Product goal

Build a minimalist, beginner-first educational tool for researching US common stocks against a user-defined investment thesis. The product explains evidence and uncertainty; it is not a brokerage, portfolio manager, return-prediction system, or personalized financial adviser.

## Current scope

| Area | Current decision |
| --- | --- |
| Audience | Beginner-first, with optional deeper evidence |
| Research universe | Provider-supported US common stocks with adequate data |
| Discover universe | Curated liquid US common stocks; no ETFs initially |
| Accounts and sync | None; personal state stays in the browser |
| Thesis | Guided structured fields plus an optional private note |
| Authoritative score | Deterministic 0–100 thesis Fit with factor evidence |
| AI output | Separate thesis-evidence assessment, never a return forecast |
| AI triggers | Visible Research result without a matching AI cache, Discover refresh, or requested Watchlist review |
| Cached page load | Research may request AI when its AI cache is missing; Discover and Watchlist remain passive |
| Watchlist | Browser-local, up to 25 stocks |
| Reviews | Manual; the UI marks the first visit in a new week as due but does not run automatically |
| Alerts | In-app review signals only; no email, SMS, push, or background notification |
| Cloud | Azure Static Web Apps managed Functions and Azure Foundry |
| Cost | Low capacity and bounded usage; $25 budget is alert-only |

## Product principles

- Explain rather than dictate.
- Keep deterministic calculations authoritative and visible.
- Label AI output separately and treat it as optional, untrusted evidence synthesis.
- Show source, period, and freshness where available.
- Distinguish missing data from poor performance.
- Never invent provider values, candidate symbols, evidence, or model output.
- Never describe Fit or AI evidence scores as expected-return predictions.
- Do not call Discover or Watchlist AI on passive page loads. Research should make its AI take available whenever a stock result is visible.
- Fall back to complete deterministic behavior when any provider or model step fails.

## Research

When a stock result is visible, Research:

1. obtains a real provider snapshot;
2. selectively fills missing fundamentals from SEC EDGAR;
3. normalizes values and metric-level provenance;
4. calculates deterministic Fit locally; and
5. may request a separate grounded AI assessment.

The research page shows:

- company, ticker, classification, delayed or end-of-day price, and freshness;
- valuation, growth, profitability, operating margin, free cash flow, leverage, liquidity, resilience, and other available metrics;
- expandable beginner definitions;
- deterministic Fit, factor contributions, conflicts, missing data, and evidence;
- a distinct AI thesis-evidence score from 0–100;
- one of `Compelling`, `Promising but mixed`, `Watch closely`, or `Reconsider`;
- grounded strengths, risks or gaps, confidence, cache/freshness status, and unavailable fallback.

The AI score measures support in the supplied evidence. It does not replace Fit, alter Fit factors, recommend a trade, or predict returns. A restored cached security reuses a matching six-hour AI cache or requests a new take when that AI cache is missing.

## Fundamental data and provenance

Finnhub normalization must:

- map `epsGrowthTTMYoy` to earnings growth;
- convert provider percentages to decimal application values;
- convert provider free-cash-flow millions to currency units;
- include operating margin, free cash flow, debt-to-equity, and current ratio;
- preserve existing values when a refresh omits a metric;
- attach metric-level source and period metadata.

Expected provenance sources are:

- **Finnhub:** trailing-twelve-month or quarterly provider metrics; the provider may not supply a metric date;
- **Alpha Vantage:** provider-reported values associated with its latest reported quarter when available;
- **SEC EDGAR:** selectively derived values tied to the latest comparable filing date.

SEC remains a selective fundamentals fallback, not a quote provider. It fills supported missing profit margin, revenue growth, EPS, return on equity, or earnings growth evidence without overwriting available provider values.

## Discover

Discover is a manual-refresh workflow. No recommendation provider or model spend occurs merely by opening the page.

Each refresh:

1. starts from the versioned curated liquid-US common-stock universe;
2. uses up to two recent/current symbols as Finnhub peer seeds;
3. accepts only peers that also exist in the curated universe;
4. excludes watched symbols and the currently researched symbol;
5. prioritizes thesis themes, style, and peer proximity;
6. fetches at most eight candidates;
7. selectively SEC-enriches at most three incomplete candidates;
8. shows at most five recommendations.

When five valid candidates exist, grounded AI may rank exactly those five and supply a thesis-evidence score, opinion, confidence, rationale, and risk for each. It may not add or substitute a symbol. If AI fails validation, times out, is rate-limited, or is unavailable, deterministic Fit order, rationale, and risk remain usable. Partial provider results are explicitly labeled. ETFs are deferred from the initial Discover universe.

## Watchlist and reviews

The watchlist stores up to 25 stocks in browser storage. A requested review refreshes current data, retains the previous snapshot and Fit, and persists the deterministic brief before AI completes.

Deterministic review signals are business-first:

- material Fit changes and thesis drift;
- revenue and earnings growth;
- profit and operating margin;
- EPS and free cash flow;
- debt-to-equity and current ratio;
- material valuation changes;
- newer filing or reporting periods;
- earnings within 14 days;
- stale or failed data;
- concentration;
- previously stored or future licensed headline-sentiment context.

There is no standalone daily-move alert. A large latest-day move may appear only as context attached to a business, filing, or earnings signal. Headline sentiment is context, not business evidence. Automatic Finnhub sentiment refresh is deferred because common free personal keys receive HTTP 403 for that optional endpoint.

When Phi is enabled, every requested review sends compact current and previous evidence for every watched stock, including stocks with no deterministic change signal. A valid response must assess every supplied stock exactly once and may also prioritize verified signals and identify cross-stock patterns supported by evidence from at least two distinct symbols.

The UI exposes these model statuses:

- `not_requested` — migrated older review;
- `loading` — deterministic brief is already available while AI runs;
- `generated` — validated AI summary, per-stock assessments, and any patterns are available;
- `fallback` — AI failed or did not pass validation;
- `disabled` — user disabled Phi for the review;
- `rate_limited` — a process-local model limit was reached.

All fallback, disabled, and rate-limited states retain the deterministic brief.

## Shared grounded intelligence API

Research, Discover, and Watchlist use one shared Foundry client with operation-specific request and response schemas.

Required controls:

- compact evidence packets and bounded request sizes;
- operation-specific Zod validation;
- evidence aliases mapped back to supplied evidence;
- rejection of unknown, duplicate, insufficient, excessive, or symbol-mismatched evidence;
- exact supplied-symbol constraints for recommendations and watchlist assessments;
- rejection of direct trade language, price targets, guarantees, and invented numeric claims;
- normalization of common schema variants before strict final validation;
- temperature zero, JSON mode, and bounded output tokens;
- one retry for a timeout, HTTP 429, or server error;
- six-hour in-process response cache separated by deployment, operation, and request;
- configurable process-local global and browser daily limits;
- timeout and HTTP status mapping;
- deterministic fallback on every failure path.

Current default output ceilings are 360 tokens for Research, 450 for Discover recommendations, and 1600 for Watchlist. Current default process-local controls are a 25-second attempt timeout, 500 calls per process window, and 10 calls per browser per process window. These controls can reset on cold start or scale-out and are not a durable billing ceiling.

## Model selection

The frozen Research, recommendation, and Watchlist bake-off selected **Phi-4-mini-instruct**, deployed as `phi-4-mini-watchlist`, as the single global winner.

Observed evidence:

- Phi-4-mini-reasoning produced stronger reasoning on some Research cases, but observed chunks took roughly 39–54 seconds.
- Reasoning produced malformed recommendation outputs, confused evidence with symbols, and had lower aggregate reliability.
- Phi-4-mini-instruct produced usable successful responses in roughly 2.6–8.6 seconds and grounded recommendation and Watchlist tasks better.
- Instruct still experienced intermittent low-capacity serverless timeouts.
- Neither model met the aspirational 95% raw-schema-validity gate.

Therefore production must retain normalization, strict evidence validation, bounded retries, caching, rate limits, and deterministic fallback. The selected model is a practical reliability choice, not a claim that raw model output is independently safe.

## Privacy and local data

Versioned browser storage may contain:

- thesis and optional note;
- watchlist, current and previous snapshots, Fits, briefs, model status, and feedback;
- cached Research AI assessments;
- cached Discover results;
- recent/current symbols and interface preferences;
- a random intelligence client identifier.

The Finnhub key stays in `sessionStorage` and goes directly to Finnhub. It must not enter the managed intelligence APIs.

Structured thesis fields and any non-empty free-text thesis note are sent to Foundry when Research AI loads or after an explicit Discover/Watchlist AI action. The note is included automatically to improve thesis-aware analysis. See `SECURITY.md` for packet details.

## Azure architecture and cost

Use:

1. Azure Static Web Apps Free for the SPA and managed Functions.
2. Same-origin SEC, Research intelligence, recommendation intelligence, and Watchlist intelligence endpoints.
3. One low-capacity Azure Foundry serverless deployment: `phi-4-mini-watchlist`.
4. A $25 Azure budget alert for visibility.

Azure Table quota code, SDK dependency, Bicep module, post-provision hook, connection setting, and durable monthly hard-stop claims have been removed. The budget alert does not block Foundry calls. Cost control depends on low capacity, bounded tokens, caches, process-local limits, short timeouts, 429 handling, and deterministic fallback.

Do not add a database, Key Vault, API Management, dedicated Function App, or background worker for this friend beta unless later requirements justify it.

## Provider and legal boundary

The friend beta uses bring-your-own-key Finnhub research. Each tester supplies a personal, non-commercial key. Alpha Vantage remains limited to the public IBM demo. SEC EDGAR supplies official filing facts through the same-origin API.

This arrangement does not grant rights to redistribute centrally licensed live market data. A future shared provider or broader public recommendation product still requires explicit display, caching, attribution, and derived-data rights.

## Safety and accessibility

- Display educational-information and not-investment-advice language.
- Avoid imperative trade language, certainty, guarantees, and price targets.
- Show unavailable instead of fabricating missing data.
- Do not redistribute article text.
- Support keyboard and screen readers, WCAG 2.2 AA core flows, reduced motion, and non-color-only status cues.
- Clearly distinguish deterministic Fit, AI evidence assessment, stale data, provider partials, cache results, and model fallback.

## Validation before push or deployment

Run the existing lint, web tests, API tests, browser tests, and builds. In addition, complete hands-on local browser testing for:

- automatic Research AI for visible stock results with six-hour cache reuse;
- separate deterministic Fit and AI assessment;
- Discover manual refresh, exclusions, limits, partial results, and fallback;
- Watchlist business-first signals and absence of a standalone daily-move alert;
- stable-stock per-stock AI assessment;
- every model status and deterministic fallback;
- mobile and desktop layout, keyboard flow, and visible evidence/provenance.

Do not claim intelligence v2 is deployed until validation, push, deployment, and live verification are complete.

## Cleanup manifest

Keep:

- the Azure Static Web App;
- the Foundry account;
- winning deployment `phi-4-mini-watchlist`;
- the $25 budget alert.

Current live cleanup candidates:

- Storage account `sthqjzjkf5lnc4k`;
- Static Web Apps settings `INTELLIGENCE_USAGE_STORAGE_CONNECTION_STRING` and `FOUNDRY_MAX_MONTHLY_CALLS`;
- losing deployments `phi-4-mini-reasoning-watchlist`, `phi-4-reasoning-watchlist`, and `phi-4-watchlist`;
- the attached monitoring/project chain only if dependency review proves it is not needed.

Cleanup is destructive. Verify dependencies and obtain explicit destructive confirmation before deleting any resource or setting.

## Non-goals

- Brokerage, holdings, trading, portfolio accounting, or return prediction.
- Accounts or cross-device sync.
- Automatic background reviews or notifications.
- Intraday streaming.
- ETF recommendations in the initial Discover universe.
- Open-ended AI chat, autonomous actions, or ungrounded investment analysis.
- A durable application-level Foundry billing stop.
- A database for user state.
