# Concepts

## Surface

A screen that adapts to a **subject** (an account, a store, a user). Defined once with
`defineSurface()`:

| Field | Meaning |
| --- | --- |
| `fixed(ctx)` | Ids for the fixed zone. Picked by code from the profile. |
| `defaultOrder(ctx)` | Adaptive order without the model. Fallback and replay baseline. |
| `items` | Every card, alert and suggestion the surface may show. |
| `signals` | Providers that summarize data for the model. |
| `relevanceLevels` | Shared rubric for cards and suggestions (2–10 levels). |
| `relevancePrompt` | Generic prompt; `{title}` is replaced per item. |
| `focus` | Optional choice question for tie-breaks and reasons. |
| `policy` | Overrides for `defaultPolicy`. |

## Items

| Kind | Question sent | Shown where |
| --- | --- | --- |
| `card` | `score` on the relevance rubric | Adaptive zone, ranked |
| `alert` | `noul` with the item's own question | Alert slot, at most one |
| `suggestion` | `score` on the relevance rubric | Suggestion row (e.g. questions for an assistant) |

`eligible(ctx)` runs first. Ineligible items are never sent to the model.

## Signals

A `SignalProvider` returns a `SignalSnapshot`:

- `key` and `value`: what goes into the model's `state`, already short;
- `facts`: structured values (`area`, `kind`, `values`) that reason templates use.

`feeds` says which call receives it: `relevance`, `alerts`, or both.

## Deciders

A `Decider` implements `evaluate({ state, questions })` and returns typed answers.
The core does not know which model or gateway is behind it.

## Policy

| Field | Default | Meaning |
| --- | --- | --- |
| `minScore` | 1.0 | Rubric position needed to enter the adaptive zone |
| `minConfidence` | 0.6 | Confidence needed for a score to count |
| `alertThreshold` | 0.75 | Probability needed to show an alert |
| `adaptiveSlots` | 6 | Adaptive zone size |
| `suggestionSlots` | 3 | Suggestion row size |
| `maxSwapsPerVisit` | 2 | Position changes allowed per visit |
| `hysteresis` | 0.5 | Score gap needed to displace an item |
| `pinForMs` | 24 h | How long a promoted item keeps its slot |
| `applyWithinMs` | 300 | Window to apply a fresh decision in the same visit |
| `timeoutMs` | 1000 | Model call timeout |
| `minRefreshMs` | 10 min | Minimum interval between fresh decisions per subject |

Defaults are starting points. Calibrate them with replay.

## Decision

What the client renders: `fixed`, `adaptive` (ranked `PlacedItem`s with reasons),
`alert?`, `suggestions`, `focus?`, and `source` (`fresh`, `cache` or `default`).
