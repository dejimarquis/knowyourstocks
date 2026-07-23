# Know Your Stocks: MVP Requirements

## Product goal

Build a minimalist, beginner-first website that lets users define an investment thesis, discover US stocks and ETFs that fit it, understand the fundamental evidence, maintain a local watchlist, and review meaningful weekly changes.

The MVP is an educational research tool for the owner and friends. It is not a brokerage, portfolio manager, real-time terminal, or personalized financial adviser.

## Agreed scope

| Area | MVP decision |
| --- | --- |
| Audience | Beginner-first, with optional deeper detail |
| Advice boundary | Educational thesis-fit insights, not direct buy or sell instructions |
| Securities | US-listed stocks and ETFs |
| Discovery | Curated liquid, non-penny, non-OTC universe |
| Lookup | On-demand scoring for other provider-supported securities with adequate data |
| Accounts | None |
| Personal data | Thesis, watchlist, preferences, and alert history stay in browser storage |
| Cross-device sync | None |
| Thesis input | Guided questions plus an optional private note |
| Recommendation method | Transparent rules and weighted scoring |
| Output | 0-100 thesis-fit score with evidence, conflicts, risks, and missing data |
| Market data | Actual provider-sourced delayed or end-of-day data |
| Mock data | Allowed only in development and tests, never in production |
| Shared refresh | Daily after the US market close |
| On-demand refresh | Opening or refreshing a security fetches the latest provider data and recalculates fit |
| Personal review | First visit on or after Monday, plus a manual refresh button |
| Alerts | In-app only |
| Analytics | No product analytics, essential error logging only |
| Feedback | Anonymous feedback form |
| Cloud | Azure only |
| Deployment | Successful main-branch pushes deploy through GitHub Actions |
| Cost | Aim for free and remain below roughly $25 per month during the friend beta |

## Product principles

- Explain rather than dictate.
- Show evidence, sources, and freshness.
- Use simple language first and reveal detail on demand.
- Favor long-term context over intraday noise.
- Keep personalization transparent and editable.
- Never invent missing data or substitute fixtures when a provider fails.
- Do not use an LLM when deterministic rules or templates are enough.
- Prefer a working shortcut over a generalized platform during the friend beta.

## Core user journeys

### Create a thesis

Capture:

- sectors and themes of interest;
- sectors to avoid;
- investment horizon;
- risk tolerance;
- preferred company size;
- growth versus income preference;
- profitability preference;
- valuation sensitivity;
- whether ETFs are acceptable;
- an optional private note.

Save the thesis locally. Never send the private note to an AI service.

### View the home brief

Show:

- latest data freshness;
- notable daily and weekly movements relevant to the thesis or watchlist;
- up to five strong new thesis matches;
- watchlist securities whose fit materially changed;
- earnings expected within 14 days;
- recent sentiment when reliable coverage exists;
- short explanations of why each item matters;
- next Monday review status;
- a manual refresh button.

### Research a stock or ETF

Opening or refreshing a security requests the latest available real provider data. End-of-day freshness is acceptable. "Live" means connected to an actual data source rather than displaying mocked values.

Show:

- name, ticker, industry or category, market cap or AUM when available;
- latest delayed close and timestamp;
- price history and common performance periods;
- volatility and drawdown context;
- relevant growth, profitability, cash flow, debt, resilience, and valuation metrics;
- thesis-fit score with factor contributions;
- positive evidence, conflicts, risks, and missing data;
- upcoming earnings or known events;
- related securities;
- beginner-friendly metric definitions;
- data sources and timestamps;
- watchlist action.

ETF pages use fund-relevant attributes and do not apply company-only metrics.

### Use the watchlist

- Add and remove securities.
- Sort by fit, movement, earnings date, or date added.
- See fit-change and alert states.
- Persist the list in the same browser.
- Warn that clearing browser storage or changing devices loses local data.

### Send feedback

- Open a small form from any page.
- Capture category, optional rating, and free text.
- Do not request names, email, holdings, or financial details.
- Show explicit success or failure.

## Thesis-fit scoring

Initial stock weights:

| Factor | Weight |
| --- | ---: |
| Sector and theme alignment | 20 |
| Risk-profile alignment | 20 |
| Fundamental quality | 20 |
| Horizon and growth alignment | 15 |
| Financial resilience | 10 |
| Valuation preference | 10 |
| Explicit local preferences | 5 |

ETF scoring uses exposure, diversification, expense, liquidity or AUM, volatility, and horizon.

Rules:

- show every factor contribution;
- cap the influence of one metric;
- distinguish missing data from poor performance;
- require adequate fresh-data coverage;
- compare metrics within sensible groups when data permits;
- use save, dismiss, or more-like-this actions only as small adjustments;
- version the scoring configuration;
- avoid direct buy and sell language.

Explanations come from controlled templates tied to actual factors, not an LLM.

## Sentiment

Sentiment is secondary context and never determines a recommendation by itself.

- Prefer provider-supplied financial-news sentiment when included in the approved data plan.
- Otherwise use a finance-specific classifier such as FinBERT only through a reliable free hosted API.
- Analyze headlines or permitted summaries, not social-media posts.
- Require enough recent sources before showing a trend.
- Show source count, confidence, provider or model, and date.
- Show unavailable when sentiment cannot be calculated reliably.
- Do not host a model in Azure for the MVP.

## Weekly review and alerts

Shared market data refreshes after each US trading day.

Personal review runs:

- on the first visit on or after Monday if it has not run that week;
- when the user presses refresh.

Create local alerts for:

- earnings within 14 days;
- material fit-score changes;
- factors changing between supportive and conflicting;
- notable relevant daily or weekly movement;
- meaningful sentiment shifts;
- stale or unavailable data.

There are no email, SMS, push, or background notifications.

## Data requirements

Start curated discovery with approximately 100-250 liquid stocks and 25-50 broad, sector, and thematic ETFs.

Exclude:

- OTC securities;
- penny stocks;
- very illiquid securities;
- securities with inadequate data coverage.

Use the provider-supported US symbol directory for lookup. Out-of-set securities can be scored on demand when enough current profile, price, and fundamental data exists.

Required data:

- security profile and classification;
- delayed or end-of-day price history;
- market cap or ETF AUM when available;
- financial statements or normalized fundamentals;
- earnings calendar;
- news metadata and permitted sentiment;
- source and freshness.

Use one primary provider behind a small adapter. Before implementation, verify public-display rights, caching, attribution, redistribution, rate limits, coverage, and cost. Reject unofficial scraping.

Candidate providers include Finnhub, Financial Modeling Prep, Twelve Data, Alpha Vantage, and Massive or Polygon.

### Provider gate status, 23 Jul 2026

Current pricing and terms research did not find a self-service plan below $25 per month that unambiguously permits public display of US market data and derived recommendation scores.

- Finnhub and Massive individual plans prohibit sharing data or derived results with other users.
- Twelve Data explicitly licenses external display through substantially higher-priced business plans or a separate agreement.
- Alpha Vantage requires separate commercial or display approval and its usable paid plan already exceeds the budget.
- Financial Modeling Prep Starter is the closest technical and budget fit, but public display requires a separate Data Display and Licensing Agreement whose cost and restrictions are not published.

Do not implement a production provider adapter until Financial Modeling Prep confirms in writing whether Starter can cover this free educational friend beta, including:

1. public display of end-of-day prices, fundamental summaries, earnings dates, and news metadata;
2. client-side derived thesis-fit scores;
3. permitted caching duration;
4. required attribution;
5. total API and display-license cost.

If Financial Modeling Prep cannot approve the use within budget, revisit the product's access model or budget rather than violating a personal-use data license.

### Interim free-data implementation

Personal research uses a bring-your-own-key Finnhub adapter:

- each tester obtains a free personal, non-commercial API key;
- the key stays in session-only browser storage and is sent directly to Finnhub;
- Finnhub provides the quote, profile, and fundamental metrics needed for the fit score with a much more usable personal rate limit;
- successful normalized results are cached locally for six hours;
- Alpha Vantage remains only for the real IBM demo and its two calls are spaced by more than one second;
- missing fundamental metrics are derived from official SEC EDGAR company facts through a same-origin managed API;
- no owner-owned key is embedded or shared with site visitors;
- Yahoo Finance is not used because it has no official supported API, its public-use terms are unsuitable, and its endpoints are prone to blocking;
- Azure provides hosting and compute but no first-party stock-market feed.

This unblocks real-data scoring without pretending that a personal API tier grants shared public-display rights. Replace it with an approved shared provider before automated discovery across the full universe.

### Beginner education

- Every visible metric must provide an expandable plain-language definition and explain how it helps evaluate the business.
- Fit-score details must explain beta, profitability, growth, resilience, and valuation without assuming investing knowledge.
- The fit score must state that it measures alignment with the user's preferences and does not predict future returns.

## Local data

Use versioned browser storage for:

- thesis;
- watchlist;
- dismissed and liked matches;
- viewed securities used for local history;
- previous fit scores;
- last weekly review;
- alert read and dismiss state;
- interface preferences.

Corrupt or incompatible data must show a recovery choice rather than silently disappearing.

## Technical design

### Application

- React, TypeScript, and Vite.
- React Router when multiple screens are introduced.
- Zod or equivalent for external and local data validation.
- Lightweight accessible charts.
- Vitest and React Testing Library.
- One Playwright smoke suite for the main journey.
- No monorepo or generalized design system package.

### Azure

Use:

1. Azure Static Web Apps Free for hosting, TLS, CDN, GitHub deployment, and small managed Functions.
2. One Azure Storage account:
   - Table Storage for feedback.
   - Blob Storage for an EOD-aware on-demand market-data cache if quotas require it.
3. Minimal built-in logging or Application Insights only when needed to diagnose failures.

Do not add PostgreSQL, Cosmos DB, Key Vault, API Management, Container Apps, or a dedicated Function App.

Configure the first friend-beta resources directly and document the settings. Add infrastructure-as-code only when multiple environments or repeated setup make it worthwhile.

### Market-data flow

1. A scheduled GitHub Actions workflow runs after market close.
2. A refresh script calls the approved provider using a secret.
3. It validates and normalizes the curated dataset.
4. It derives metrics and available sentiment.
5. It builds static versioned JSON for discovery.
6. It deploys only after validation passes.
7. A small `GET /api/security/{symbol}` Function fetches the latest real data for an opened or manually refreshed ticker.
8. The Function validates the response, optionally uses a short EOD-aware cache, and never returns test fixtures.
9. The browser calculates the personal score locally so the thesis remains private.

### Feedback flow

- `POST /api/feedback` validates category, rating, text length, page, and app version.
- Store feedback in Azure Table Storage.
- Add a honeypot and payload limits.
- Add stronger rate limiting only if abuse occurs.
- Review through Azure Storage Explorer or a small owner-only script.

## Deployment

On pushes and pull requests:

- install dependencies;
- run type-check;
- run focused tests;
- build production assets.

On main, deploy automatically to Azure Static Web Apps.

The scheduled refresh:

- runs after market close on US weekdays;
- supports manual dispatch;
- validates freshness, schema, record count, and attribution;
- preserves the last deployed site when refresh fails.

Do not build a multi-environment promotion pipeline for the friend beta.

## Safety, privacy, and legal

- Display "Educational information, not investment advice."
- Avoid promises, certainty, and imperative trade language.
- Explain that scores reflect user preferences and incomplete historical data.
- Show data delays, timestamps, and attribution.
- Do not redistribute copyrighted article text.
- Keep personal research state in the browser.
- Do not collect product analytics.
- Do not request personal or financial information in feedback.
- Keep provider keys in GitHub or Azure secrets.

## Accessibility and quality

- Meet WCAG 2.2 AA for core flows.
- Support keyboard and screen readers.
- Do not rely on red and green alone.
- Respect reduced motion.
- Give charts textual summaries.
- Keep mobile fast and uncluttered.
- Clearly distinguish real, stale, unavailable, and test data.

## Focused testing

Cover:

- scoring factors, weights, missing data, and stock versus ETF behavior;
- thesis and watchlist persistence;
- Monday and manual review logic;
- alert deduplication;
- provider normalization and refresh validation;
- on-demand lookup, cache behavior, and explicit provider failure;
- evidence and disclaimer rendering;
- feedback validation;
- one browser journey from thesis creation to watchlist and security detail.

## Non-goals

- Accounts or cross-device sync.
- Brokerage connections, holdings, trading, or portfolio accounting.
- Intraday streaming or exchange tick data.
- Options, crypto, forex, or non-US markets.
- Email, SMS, or push notifications.
- Social feeds or public portfolios.
- LLM-generated investment analysis.
- Hosted AI models.
- Subscription billing.
- Multiple data providers.
- A database for application state.
- A full admin dashboard.
- Multiple Azure environments or extensive infrastructure automation.

## Implementation phases

1. **Foundation and provider:** Initialize the app, persist this specification, add focused tooling and test-only fixtures, approve one provider, and select the curated universe.
2. **Useful vertical slice:** Build local thesis persistence, scoring, discovery, lookup, watchlist, detail pages, real on-demand EOD data, and the scheduled static refresh.
3. **Continuous deployment:** Add Azure Static Web Apps and GitHub Actions for push deployment and scheduled data refresh.
4. **Weekly habit and feedback:** Add Monday/manual alerts and anonymous Azure Table Storage feedback.
5. **Friend-beta hardening:** Validate mobile, accessibility, provider failure, quota, attribution, legal language, and cost. Verify production never serves mocked market values.
