# Grounded opinion intelligence

## Authority model

Deterministic code is authoritative for normalized market and filing values, provenance, freshness, thesis Fit and factor contributions, Watchlist signals, candidate membership, and fallback behavior.

Azure Foundry is a best-effort opinion layer. It reviews only supplied evidence and cannot create market facts, alter Fit, predict returns, issue trade instructions, or expose hidden chain-of-thought.

## Product output contract

The canonical opinion product contains:

- an opinion label;
- a concise reasoning summary;
- why the evidence fits the thesis;
- concerns;
- what to watch or research next;
- explicit uncertainty;
- low, medium, or high confidence; and
- citations mapped to supplied evidence.

Research exposes the complete contract directly. Discover and Watchlist use operation-specific labels such as thesis rationale, main concern, what changed, and overall summary while preserving the same cited opinion concepts.

There is no AI numeric score. Deterministic Fit remains separate and authoritative.

## Operation contracts

### Research

Research returns `Fits thesis`, `Mixed`, `Weak fit`, or `Insufficient evidence`, a short headline, cited reasoning summary, cited why-it-fits points, cited concerns, cited next-watch items, confidence, and a cited uncertainty statement.

### Discover

Discover is manual. It builds a bounded candidate set from the curated liquid-US common-stock universe plus accepted Finnhub peer context, excluding current and watched symbols. The model must return every supplied candidate exactly once and cannot introduce another symbol.

Each ranked candidate receives an opinion, thesis rationale, main concern, next research step, confidence, and citations. Invalid or unavailable model output leaves deterministic Fit ordering and explanations in place.

### Watchlist

Watchlist review remains business-first and assesses every supplied stock, including stable stocks. Each stock receives an opinion, cited change summary, cited fit points, cited concerns, cited next-watch items, and confidence. The overall review includes a cited summary and prioritized evidence.

Up to three cross-stock patterns are optional. An invalid pattern is dropped when the core review is otherwise valid; a valid pattern must cite evidence from at least two distinct supplied symbols.

## Strict generation and validation

The shared API uses operation-specific request schemas and request-specific strict JSON Schema responses:

- citation IDs are enumerated from the current evidence packet;
- Discover and Watchlist symbols are enumerated from the current request;
- unknown properties are rejected;
- required fields, item counts, and enum values are enforced during generation.

The server then applies independent validation:

- map citations only to supplied evidence;
- reject unknown, duplicate, insufficient, excessive, or symbol-mismatched citations;
- require all Discover candidates and Watchlist stocks exactly once;
- reject generated digits and quantitative magnitude words in narrative text;
- reject invented numeric claims, direct advice, guarantees, and price targets;
- validate cross-stock distinct-symbol grounding;
- extract only the first complete JSON object and discard trailing model text;
- ignore provider `reasoning_content` and parse only visible `message.content`.

The prompt requests only concise reasoning summaries and explicitly forbids hidden chain-of-thought.

## Retry, cache, and fallback

Validated responses are cached in process for six hours by deployment, operation, schema, and request hash. One retry is allowed for a transient timeout, HTTP 429, or server error. Each attempt is capped at 20 seconds so GPT-5-mini can complete its strict structured response; deterministic output remains visible while intelligence is pending or unavailable.

Malformed JSON, refusal, content filtering, schema failure, grounding failure, rate limiting, timeout, or server failure maps to a truthful unavailable state while deterministic Research, Discover, or Watchlist output remains usable.

Process-local global and browser windows reduce bursts but are not durable billing limits.

## Model routing

| Operation | Deployment | Rationale |
| --- | --- | --- |
| Research | `gpt-5-mini-intelligence` | Highest evaluated Research quality and stronger relevance/completeness than the open-source alternative |
| Discover | `gpt-5-mini-intelligence` | 20/20 grounded candidate rankings with the strongest quality for thesis-aware comparison |
| Watchlist | `gpt-oss-120b-intelligence` | 20/20 grounded concise multi-stock reviews with materially lower latency and cost |

GPT-5-mini is the production target for Research and Discover. The final concurrent evaluation generated 24/24 Research and 20/20 Discover responses. Estimated use was about $0.0018 and $0.0020 per call.

The initial broad Watchlist response could exhaust output on gpt-oss and time out on GPT-5-mini. The final contract requires exactly one concise fit, concern, and watch item per stock. With that production-shaped strict schema, gpt-oss generated 20/20 grounded reviews, scored 4.725, reached an 11.732-second p95, and cost about $0.000487 per call. GPT-4.1-mini was rejected because Azure reported the requested version as deprecating in April 2027. Both Phi-4-mini variants rejected strict JSON Schema and were unreliable in JSON mode. After live verification retain GPT-5-mini and gpt-oss; remove all Phi deployments and the legacy fallback setting.

## Evaluation evidence

Frozen production-derived fixtures cover PLTR, CRWV, MSFT, Bloom Energy, Discover, and stable/changing Watchlist scenarios.

| Operation | First-attempt generated | Quality | p95 | Estimated cost/call |
| --- | ---: | ---: | ---: | ---: |
| GPT-5-mini Research | 24/24 | 4.958 | 15.031s under concurrency | $0.001794 |
| GPT-5-mini Discover | 20/20 | 4.875 | 18.046s under concurrency | $0.002013 |
| gpt-oss-120b Watchlist | 20/20 | 4.725 | 11.732s under concurrency | $0.000487 |

Every response in the final operation-specific runs passed strict schema and grounding. GPT-5-mini remains too slow for the multi-stock Watchlist contract, while gpt-oss meets all Watchlist quality, grounding, latency, and cost gates.

Cost estimates use public Azure catalog/calculator prices and are not contractual.

## Data and privacy

Packets contain compact supplied evidence, structured thesis fields, and any non-empty thesis note. They exclude the Finnhub key and raw provider payloads. Returned citations are server-mapped to the supplied packet.

No raw prompt or packet is intentionally persisted server-side. Validated output may live in the six-hour in-process cache. Hidden `reasoning_content` is neither displayed nor stored.

## Validation

The current quality suite contains 66 frontend tests, 47 API tests, and 30 Playwright journeys covering Research, Discover, Watchlist, caching, fallback, storage recovery, accessibility, and mobile behavior. These counts describe suite coverage and are not deployment proof.

The new routing is not complete until automated validation, hands-on local browser testing, app-setting validation, deployment, live operation checks, rollback verification, and final unused-deployment cleanup are complete.
