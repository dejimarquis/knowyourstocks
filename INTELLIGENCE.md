# Watchlist intelligence

## Authority model

The deterministic engine is authoritative for:

- signal coverage;
- severity;
- metric values;
- thesis-fit scores;
- source dates;
- evidence.

Azure Foundry Phi is best-effort and experimental. It can prioritize existing signals and select relationships among them, but cannot create market facts or trade instructions.

## Model selection

The implementation evaluated:

- Phi-4-mini-instruct;
- Phi-4-mini-reasoning;
- Phi-4-reasoning;
- Phi-4.

For the bounded watchlist task, Phi-4-mini-instruct was selected:

- mini-reasoning used more tokens and roughly doubled latency in the benchmark;
- reasoning deployments were less compatible with constrained output and tool parsing;
- regular Phi-4 timed out at the tested low serverless capacity;
- mini-instruct handled a compact evidence-selection prompt quickly and at low token cost.

The model is not trusted to write final financial claims. It receives aliases such as `s1` and `s2`, selects an order and potential relationships, and the API maps those aliases back to verified signals. User-facing evidence text is generated from deterministic data.

## Failure behavior

The rules-based brief is persisted before the model call begins.

The model call:

- runs asynchronously;
- has a server timeout;
- is schema-validated;
- rejects unknown evidence IDs;
- rejects prohibited buy/sell/hold language;
- falls back without changing the deterministic brief.

## Cost controls

- one model attempt per completed review;
- at most 25 watched securities;
- compact evidence packet;
- short output budget;
- identical-packet response cache;
- daily global and anonymous-client request limits;
- Phi serverless inference with no idle GPU cost.

## Privacy

The free-text thesis note is excluded by default. The user must explicitly enable sharing it with the Azure Phi review.

Finnhub credentials never enter the intelligence endpoint.
