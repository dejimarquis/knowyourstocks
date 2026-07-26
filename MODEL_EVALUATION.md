# Opinion intelligence evaluation

The selected production-aligned routing is:

- Research: `gpt-5-mini-intelligence`
- Discover: `gpt-5-mini-intelligence`
- Watchlist: `gpt-oss-120b-intelligence`

The frozen production-derived fixtures constrain every citation ID and symbol
in strict JSON Schema. Generated narrative text may not contain digits or
numeric values; citations carry numeric evidence. Invalid optional cross-stock
patterns are dropped and reduce usefulness rather than failing an otherwise
valid Watchlist review. Core claims remain hard-gated.

The fixtures are production-derived: PLTR, CRWV, MSFT, Bloom Energy,
Discover, and stable/changing Watchlist packets.

## Final production-shaped concurrent runs — 2026-07-26

| Operation | Samples | Quality | First-attempt generated | p50 | p95 | Max | Estimated cost/call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Research / GPT-5-mini | 24 | 4.958 | 24/24 | 14.318s | 16.645s | 16.704s | $0.002026 |
| Discover / GPT-5-mini | 20 | 4.875 | 20/20 | 13.887s | 18.046s | 18.109s | $0.002013 |
| Watchlist / gpt-oss-120b | 20 | 4.725 | 20/20 | 8.551s | 11.732s | 13.041s | $0.000487 |

Every response passed the core strict-schema and grounding gates. The runs used
two concurrent requests to represent overlapping user activity. No refusals
occurred.

Average token use:

- Research: 756 prompt, 681 visible output, 237 reasoning, 1,674 total.
- Discover: 674 prompt, 660 visible output, 262 reasoning, 1,596 total.
- Watchlist: 470 prompt, 694 visible output, no reported reasoning, 1,164 total.

Estimates use GPT-5-mini at $0.25 per million input tokens and
$2.00 per million output tokens, and gpt-oss-120b at $0.15 per million input
tokens and $0.60 per million output tokens. The source is the public Azure
calculator/catalog and is not a contractual quote.

## Final direct-testing decision

Use GPT-5-mini for Research and Discover. It produced the strongest nuanced
thesis analysis and generated every concurrent release sample.

Use gpt-oss-120b for Watchlist. The initial broad Watchlist schema could exhaust
its output budget, while GPT-5-mini timed out on multi-stock reviews even after
capacity was raised and attempts were extended. The final schema bounds every
stock to one concise fit, concern, and watch item. Under that exact
production-shaped contract, gpt-oss generated 20/20 grounded responses, scored
4.725, and was roughly four times cheaper than GPT-5-mini Research/Discover.

## Targeted gpt-oss Research run

A final 24-sample Research-only run used gpt-oss-120b across all six fixtures
with the same digit-free prompt, citation-enumerated schema, concurrency, and
pacing as the selected-routing evaluation.

| Metric | GPT-5-mini baseline | gpt-oss-120b target |
| --- | ---: | ---: |
| First-attempt generated | 23/24 | 24/24 |
| Strict schemas | 23/24 first attempts | 24/24 |
| Core grounded responses | 23/24 first attempts | 23/24 |
| Rubric average | 4.792 | 4.479 |
| Groundedness / relevance / completeness / usefulness | 4.833 / 4.750 / 4.750 / 4.833 | 4.833 / 3.792 / 4.292 / 5.000 |
| p50 / p95 / max | 7.871s / 11.316s / 14.006s | 3.559s / 4.191s / 4.404s |
| Prompt / output / reasoning / total tokens per call | 715 / 645 / 229 / 1,589 | 571 / 346 / 0 / 917 |
| Estimated cost per call | $0.001928 | $0.000293 |

gpt-oss returned every request and passed the Research latency gate, using about
42% fewer tokens and costing about 85% less. One IBM response nevertheless
placed a numeric value directly in narrative text. Its request-level core pass
rate was therefore 95.8%, and the failed sample produced a rubric dimension
below three.

**Research routing recommendation: keep GPT-5-mini selected; do not route
Research to gpt-oss-120b.** gpt-oss does not meet the required 100% core
schema/grounding gate despite its substantial latency and cost advantage.

## GPT-5, GPT-4.1, and open-source rationale

GPT-5-mini produced the best Research and Discover quality, especially for
relevance, completeness, and nuanced thesis grounding.

gpt-oss-120b is materially faster and cheaper and now meets the final concise
Watchlist strict-output contract. It remains unsuitable for Research because its
Research grounding quality was lower.

GPT-4.1-mini was considered as a non-reasoning baseline. Azure rejected creation
of the requested `2025-04-14` deployment because it is deprecating in April
2027. Beginning a new production dependency on that lifecycle was rejected.

After live verification and rollback validation, keep
`gpt-5-mini-intelligence` and `gpt-oss-120b-intelligence`. Remove every Phi
deployment and the legacy `FOUNDRY_DEPLOYMENT` setting.

Hidden `reasoning_content` is ignored and is never stored or displayed.

## Validation scope

The current suite contains 66 frontend tests, 47 API tests, and 30 Playwright
journeys. These counts describe current coverage; they are not deployment proof.

All prices are estimates from the public Azure catalog/calculator and are not
contractual quotes.
