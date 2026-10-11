# Architecture

## Layers

| Layer | Package | Pure? |
| --- | --- | --- |
| Definitions (surface, items, rubric) | core | yes |
| Signal collection | your code, via `SignalProvider` | no (I/O) |
| Request building | core `buildRequests` | yes, given snapshots |
| Model access | providers | no (network) |
| Composition (policy) | core `compose` | yes |
| Orchestration, cache, log | core `decide` + stores | no |
| Rendering | react (headless) | — |

`compose` is a pure function of (answers, previous decision, time). That makes it unit-testable
and lets replay re-run history deterministically.

## Timing

| Step | Budget |
| --- | --- |
| Render fixed zone + cached order | no wait on the model |
| Collect signals | ≤ 100 ms (pre-aggregated data) |
| Two model calls in parallel | p50 ~150 ms, timeout 1 s |
| Apply fresh decision in the same visit | only within 300 ms of page open |

## Fallback chain

cached decision → `defaultOrder` → static screen. Errors, timeouts and low confidence never
leave an empty slot.

## Stability rules (in `compose`)

1. Fixed zone never changes unless the profile does.
2. At most `maxSwapsPerVisit` changes; the largest score gaps go first.
3. An item displaces another only if its score is higher by `hysteresis`.
4. Promoted items stay `pinForMs`, unless a shown alert in the same area appears.
5. Demoted items remain reachable under "See all" (`Decision.more`).
6. A thumbs-down demotes an item for `demoteForMs` (7 days) via a `FeedbackStore`; the entries double as replay labels (`Decision.demoted`).
