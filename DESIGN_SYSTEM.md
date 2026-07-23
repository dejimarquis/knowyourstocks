# Know Your Stocks Design System

> The source of truth for the product interface.
>
> **Stack:** React 19, TypeScript strict, Vite, plain CSS variables.
> **Mode:** Light only.
> **Source:** `REQUIREMENTS.md`, with a beginner-first audience making educational investment decisions.

## 1. Brand attributes

| Attribute | UI consequence |
| --- | --- |
| **Trustworthy** | Every market value has a source and date. The interface never fills gaps with plausible-looking data. |
| **Clear** | Plain language leads. Definitions and methodology remain one step away. |
| **Fresh** | Near-white paper, generous space, and one ultramarine signal make the instrument feel crisp rather than clinical. |
| **Grounded** | Recommendations expose factors, conflicts, and missing evidence. |
| **Simple** | The page has one clear path: search, understand, then personalize. |

**Emotional target:** The product should feel like a breath of fresh air, not a finance terminal.

## 2. Core principles

1. Clarity over cleverness.
2. Evidence before narrative.
3. Hierarchy is the feature.
4. Color carries meaning rather than decoration.
5. Keep the friend-beta interface small and direct. Do not add a dashboard until one is needed.
6. Quiet until a genuine risk or conflict needs attention.
7. Progressive disclosure for advanced metrics.
8. WCAG 2.2 AA is required.

## 3. Anti-goals

Avoid trading-terminal density, ticker tape decoration, gradients, rows of badges, tiny secondary text, and unearned urgency.

No colored card borders, dot badges, generic progress bars, mixed typefaces, UI emojis, or template starter visuals.

## 4. Surface map

| Surface | Archetype | Primary object | Loudest read | Answerable in 5 seconds | Density |
| --- | --- | --- | --- | --- | --- |
| Thesis setup | Form | Investment thesis | The thesis question | What preferences shape results | Comfortable |
| Security detail | Detail | Stock or ETF | Thesis fit and current source date | Why it fits and what conflicts | Dense |

## 5. Token architecture

Three layers are mandatory:

1. Primitive OKLCH values live only in `src/index.css`.
2. Semantic roles map primitives to purpose.
3. Components use semantic variables only.

Components must not contain raw colors.

## 6. Visual system

### Color

- Background: near-white neutral paper.
- Primary action: ink black, like a physical instrument control.
- Fit signal: ultramarine, reserved for the score, focus, and one small brand mark.
- Success: green, reserved only for positive market movement or confirmed state.
- Warning: brown-orange text for caution.
- Cards: bright white with soft depth.

### Research basis

- Nielsen Norman Group progressive-disclosure guidance: show only the few options users need first, then reveal specialized details on request.
- CFPB design-system principles: financial interfaces should be consistent, effective, accessible, mobile-first, and understandable to the public.
- Current beginner-investing UX patterns: start with search, summarize before detail, limit visible metrics, explain scores, and show data freshness.
- Three rendered candidates were compared. The monochrome typographic sheet won because it had the strongest hierarchy, stage-demo impact, and fewest startup/SaaS tells.

All text, control borders, and focus indicators must meet WCAG 2.2 AA using computed sRGB contrast. Recheck contrast whenever a semantic token changes.

### Typography

- System UI sans for every product surface.
- System mono only for future ticker symbols or raw identifiers.
- 16px base. Descriptive secondary text stays at 14px or above. 12px is reserved for labels.
- Financial values use tabular numerals.

### Spacing and shape

- 4px base spacing.
- 12px default control radius, 22px major surface radius.
- Soft shadows separate the few major white surfaces.
- Motion stays under 150ms and respects reduced-motion preferences.

## 7. Component rules

- Ordinary components live in `src/components` when they become reusable.
- Business logic stays outside presentational primitives.
- Every control has default, hover, focus, disabled, error, and loading behavior.
- Focus uses the semantic ring token and is never removed.

### Signature components

- **Thesis lens:** a compact summary of sectors, horizon, risk, and style.
- **Fit answer:** total score and one plain-language sentence, with factor details collapsed by default.
- **Data trust line:** source, freshness, delay, and availability shown together.
- **Weekly change:** previous evidence versus current evidence, with a plain-language explanation.

Warm yellow appears only as a restrained thesis-fit accent.

## 8. Voice

- Sentence case.
- Specific dates such as `24 Jun 2026`.
- No exclamation marketing or emoji.
- No imperative buy or sell language.
- Empty values use `—`.
- UI copy avoids em dashes.

## 9. Key decisions

- Light only.
- No external web font in the MVP.
- Ink-black controls, one ultramarine fit signal, and green only for positive market movement.
- Typography, whitespace, grid alignment, and hairlines carry the interface.
- The result is one structured object rather than a stack of rounded cards.
- Search first, personalize second.
- Keep the page simple enough for the owner and friends.
- No fake production market data under any circumstance.
