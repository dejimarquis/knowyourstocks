# Decision log

This file records the final opinion-intelligence architecture, its tradeoffs, and rollout boundary.

## Deterministic Fit remains authoritative

Fit is calculated from normalized evidence with visible factor contributions. It remains the only numeric thesis score and is independent of model availability.

Opinion intelligence returns an opinion, concise cited reasoning, why the evidence fits, concerns, what to watch next, uncertainty, confidence, and citations. It does not return an AI numeric score, predict returns, change Fit, alter provider values, set signal severity, add candidates, or expose hidden chain-of-thought.

## Output is constrained before and after generation

Each operation builds a strict JSON Schema for the specific request. Supplied evidence IDs and symbols become schema enums, so the model cannot freely name citations or securities.

The server then:

- validates the request and strict response shape;
- maps citations only to supplied evidence;
- verifies evidence existence, uniqueness, counts, and symbol attachment;
- rejects generated digits/numeric values, invented numeric claims, advice, guarantees, and price targets;
- requires every supplied Discover candidate and Watchlist stock exactly once;
- drops an invalid optional cross-stock pattern while preserving valid core Watchlist output;
- retries one transient first-attempt failure;
- caches validated output for six hours; and
- preserves deterministic fallback for every failure.

No raw model response is trusted directly.

## Operation-specific model routing replaces a single winner

The selected production-aligned routing is:

- Research: `gpt-5-mini-intelligence`;
- Discover: `gpt-5-mini-intelligence`;
- Watchlist: `gpt-oss-120b-intelligence`.

GPT-5-mini is the quality-first target for Research and Discover. The final concurrent run generated 24/24 Research and 20/20 Discover responses with strict grounding. Observed use was about $0.0018 and $0.0020 per call.

The original broad Watchlist response was unreliable on both models: GPT-5-mini timed out and gpt-oss could exhaust output. The final contract bounds every stock to one concise fit, concern, and watch item. Under that production-shaped strict schema, gpt-oss generated 20/20 grounded responses, scored 4.725, reached 11.732-second p95, and cost about $0.000487 per call. It is the Watchlist target.

GPT-4.1-mini would have offered a familiar non-reasoning baseline, but Azure rejected creation of the requested deployment because model version `2025-04-14` is deprecating in April 2027. Starting a new dependency on that lifecycle was rejected.

## Evaluation is production-derived

The frozen cases use captured PLTR, CRWV, MSFT, Bloom Energy, Discover, and stable/changing Watchlist packets.

- GPT-5-mini Research: 24/24 generated; quality 4.958; p95 15.031s under concurrency; about $0.001794 per call.
- GPT-5-mini Discover: 20/20 generated; quality 4.875; p95 18.046s under concurrency; about $0.002013 per call.
- GPT-5-mini Watchlist: failed the concurrent multi-stock release gate despite increased capacity and a 20-second attempt.
- gpt-oss-120b Watchlist: 20/20 generated; quality 4.725; p95 11.732s; about $0.000487 per call with the concise strict contract.

The one Research miss was a transient first-attempt transport timeout. Production performs one bounded retry, so rollout validation must verify the complete retry path rather than treating the raw first-attempt result as an unhandled product failure.

Pricing uses the public Azure catalog/calculator and is an estimate, not a contractual quote.

## Privacy stays local-first

The thesis, optional note, watchlist, snapshots, Fits, briefs, caches, and feedback remain browser-local. When opinion intelligence runs, structured thesis fields, any non-empty note, and compact evidence are sent to Foundry.

The Finnhub key never enters the intelligence APIs. Citations are mapped back to evidence already supplied in the request. The API parses only visible `message.content`; provider `reasoning_content` is ignored and is never stored or displayed.

## Cleanup leaves one deployment

Research and Discover settings target `gpt-5-mini-intelligence`; Watchlist targets `gpt-oss-120b-intelligence`. The legacy `FOUNDRY_DEPLOYMENT` setting remains only through rollback verification and must then be removed.

After live verification, inventory the Foundry account and retain GPT-5-mini plus gpt-oss-120b. Remove every Phi deployment. Cleanup remains destructive and requires dependency verification and explicit approval.

## Testing contract

The current suite contains 66 frontend tests, 47 API tests, and 30 Playwright journeys spanning Research, Discover, Watchlist, fallback behavior, caching, storage recovery, accessibility, and mobile reachability. These counts document current coverage, not deployment proof.

## Deferred work

Accounts, cross-device sync, background notifications, centrally licensed shared market data, ETF discovery, durable distributed model quotas, authenticated managed identity, and multi-region infrastructure remain deferred until usage justifies their cost and complexity.
