# Replay

Offline evaluation of a surface over labeled history. It answers one question before any user sees the
adaptive screen: **does the ranking beat the static default order, and with which thresholds?**

Package: `@reflexui-jev/replay`.

## Why it exists

`compose` is deterministic, but the numbers it uses (`minScore`, `minConfidence`, `alertThreshold`,
`hysteresis`) are educated guesses, and the model's answers are the one thing you do not control.
Without data you cannot tell whether the adaptive screen is better than the fixed one, or whether
a threshold is too strict. Replay turns those guesses into measurements:

- **Go/no-go gate.** If the hit rate does not beat the default order, do not ship.
- **Calibration.** Re-run the same cases with different policy values and pick by evidence.
- **Regression check.** Re-run after changing the model version, a prompt, a rubric or a signal.
- **Cost and latency estimate.** p50/p95 of the model calls and input tokens per case.

Replay measures the **quality of the ranking**, not its smoothness. Each case is a first visit
(no cache, no previous decision), so stability rules (swap limit, hysteresis, pins) do not apply.

## What you need: labeled cases

A case is one moment in the past, plus what a human says should have been on top.

```ts
interface ReplayCase<Ctx> {
  id: string;            // e.g. "store-12/2026-W31"
  subjectId: string;
  ctx: Ctx;              // the same context your signals read at that time
  expectedTop: string[]; // item ids that belong in the top slots
}
```

Stored as JSON Lines (one case per line) it can be loaded with `parseReplayCases`:

```jsonl
{"id":"acme/2026-W31","subjectId":"acme","ctx":{"plan":"free","seats":4,"areas":{}},"expectedTop":["onboarding-progress","usage-trend"]}
```

Guidelines for labels:

- Label with someone who knows the domain, looking at what was true **at that moment**.
- Label 2–4 items per case. Include the alert's id if one should have fired.
- Aim for dozens of cases that cover different situations, not many cases of the same one.
- Keep real data out of git (`replay-data/` is git-ignored) and anonymized; see [privacy](privacy.md).
- A "not useful" feedback recorded by a `FeedbackStore` is a negative label you can turn into a case.

With a handful of invented cases replay only proves the code runs. It cannot calibrate anything.

## Running it

```ts
import { runReplay, formatReport } from "@reflexui-jev/replay";
import { typesafeDecider } from "@reflexui-jev/providers";

const report = await runReplay({
  surface: home,
  decider: typesafeDecider(),
  cases,
  topSlots: 3, // how many positions count as "the top" (default 3)
  minHits: 2,  // expected items that must land there for a case to count as a hit (default 2)
});

console.log(formatReport(report));
```

How a case is scored:

1. Signals are collected and the two requests (relevance, alerts) are built exactly as in production (`buildRequests`).
2. The decider answers, and `composeWithTrace` applies the policy.
3. The **top** is the alert (when one is shown) followed by the adaptive zone, cut at `topSlots`.
4. `hits` is how many `expectedTop` ids are in the top. The case is a **hit** when `hits >= min(minHits, expectedTop.length)`.
5. The **baseline** does the same with `defaultOrder` and no model.

If the decider throws for a case, that case falls back to the default order (so it can never look better than
the baseline) and is counted in `failures`.

### The report

| Field | Meaning |
| --- | --- |
| `hitRate` | Share of cases that are hits with reflexui |
| `baselineHitRate` | Share of cases that are hits with the default order. The number to beat |
| `latencyP50Ms`, `latencyP95Ms` | Time of the model calls per case (both run in parallel) |
| `inputTokens` | Sum of `usage.inputTokens` reported by the decider |
| `failures` | Cases where the decider threw |
| `perCase` | `{ id, top, hits, baselineHits, latencyMs, error? }` for each case |

`formatReport(report)` prints a summary with one line per case: `+` better than baseline, `=` equal, `-` worse.

### Calibrating thresholds

`policy` overrides the surface's policy for one run, and `cachingDecider` remembers the model's answers, so a
sweep calls the model once per case:

```ts
import { cachingDecider } from "@reflexui-jev/replay";

const decider = cachingDecider(typesafeDecider());
for (const minConfidence of [0.3, 0.45, 0.6, 0.75, 0.9]) {
  const r = await runReplay({ surface: home, decider, cases, policy: { minConfidence } });
  console.log(minConfidence, r.hitRate, r.baselineHitRate);
}
```

Do not pick the best value on the same cases you used to tune it: keep some cases aside to confirm.

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `surface` | required | Any `defineSurface()` result |
| `decider` | required | The real one for calibration; `mockDecider` only checks the plumbing |
| `cases` | required | `ReplayCase[]` |
| `topSlots` | `3` | Positions that count as the top |
| `minHits` | `2` | Expected items needed for a hit |
| `policy` | none | `Partial<Policy>` override for this run |
| `concurrency` | `4` | Cases evaluated at the same time (watch your rate limit) |

## Example: the 5 mocked people

`reflexui-example-full` ships a script with one hand-labeled case per person (`data/labels.json`). Against the
real Jev API (`jev-1.13.0`), one run gave:

```
cases: 5
hit rate: 80%  vs default order: 20%  (+60 pts)
latency p50 360 ms · p95 469 ms · input tokens 14068
```

Read it with care. Five cases written by the same person who wrote the signals is a demonstration, not a
validation: the 80% says the pipeline works and that the signals carry information, not that 0.6 is the right
`minConfidence`. Results also move a little between runs (one alert sat exactly on the 0.75 threshold and
flipped), which is the kind of thing a larger set is for.

## Limits

- No stability: sequences of visits are not replayed (see the swap limit and pins in [architecture](architecture.md)).
- No offline substitute for the model: a replay with `mockDecider` or a heuristic says nothing about Jev.
- The metric is hit-based. It does not weigh position inside the top or penalize wrong items shown.
