# reflexui

**Adaptive screens powered by Jev.** Screens that rearrange themselves around what matters right now, by reflex.
A fast typed-judgment model decides *what* is relevant; your code decides *what is allowed*.

> **Status: pre-alpha.** This repository contains the structure, the types and the design.
> Most functions are stubs that throw `not implemented yet (milestone Mx)`. See [Roadmap](#roadmap).

---

## Contents

- [Why](#why)
- [How it works](#how-it-works)
- [Core concepts](#core-concepts)
- [A quick look](#a-quick-look)
- [Packages](#packages)
- [Providers](#providers)
- [Examples](#examples)
- [Design principles](#design-principles)
- [Roadmap](#roadmap)
- [Privacy](#privacy)
- [Contributing](#contributing) · [License](#license) · [Prior art](#prior-art)

---

## Why

Most dashboards show the same grid to everyone. The one number that needs attention today
(late deliveries, a unit falling behind, a spike in churn risk) sits below the fold next to
ten numbers that did not change.

Generative UI with LLMs can rebuild a screen per user, but it is slow (seconds), expensive,
and can invent labels and numbers. **reflexui** takes a narrower path:

- every card, alert and suggestion **already exists** with values computed by your code;
- a **System One model** such as [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
  only *ranks, gates and picks* among them, returning typed answers with calibrated confidence
  in ~70–500 ms;
- a **policy layer** in code applies thresholds, stability rules and fallbacks.

The result: a screen that adapts to the moment, never shows invented content, and never
blocks rendering on the model.

## How it works

A surface has two zones:

| Zone | Who decides | Changes when |
| --- | --- | --- |
| **Fixed zone** (first scroll) | Your code, from the subject's profile | The profile changes |
| **Adaptive zone** | The model ranks, the policy limits | Signals change, max N swaps per visit |

One visit:

```mermaid
flowchart LR
  A[Visit] --> B[Render now:<br/>fixed zone + cached order]
  A --> C[Collect signals<br/>code summarizes]
  C --> D1[Call: relevance<br/>Score per card + focus]
  C --> D2[Call: alerts<br/>Noul per alert]
  D1 --> E[Compose<br/>thresholds, hysteresis,<br/>max swaps, fallback]
  D2 --> E
  E --> F[Apply now if within 300 ms,<br/>else next visit]
  E --> G[(Cache)]
  E --> H[(Decision log → replay)]
```

The two calls run in parallel and each receives only the signals its questions need.

## Core concepts

| Concept | What it is | Where |
| --- | --- | --- |
| **Surface** | A screen definition: fixed zone, default order, items, signals, rubric, policy | `defineSurface()` |
| **Item** | A `card`, an `alert` or a `suggestion`, with an eligibility rule and reason templates | `SurfaceItem` |
| **Signal** | A provider that turns raw data into a short, model-ready snapshot + structured facts | `SignalProvider` |
| **Question** | A typed question: `score` (rubric), `choice` (options) or `noul` (yes/no probability) | `score()`, `choice()`, `noul()` |
| **Decider** | Anything that answers typed questions: Jev via a gateway, an LLM, a mock | `Decider` |
| **Policy** | Thresholds and stability rules, all in code | `Policy`, `defaultPolicy` |
| **Decision** | What to render: fixed ids, ranked adaptive items, at most one alert, suggestions, reasons | `Decision` |
| **Replay** | Run the surface over labeled history and compare with the default order | `runReplay()` |

Full reference: [docs/concepts.md](docs/concepts.md).

## A quick look

```ts
import { defineSurface } from "@reflexui-jev/core";

export const home = defineSurface<RestaurantCtx>({
  id: "restaurant-home",
  fixed: (c) => (c.units >= 2
    ? ["revenue", "orders", "avg-ticket", "revenue-per-unit"]
    : ["revenue", "orders", "avg-ticket", "avg-rating"]),
  defaultOrder: () => ["delivery-time", "cancellation-rate", "rating-trend", "top-dishes"],
  items: [
    { id: "delivery-time", kind: "card", area: "delivery", title: "Total delivery time",
      eligible: (c) => c.hasDelivery,
      reasons: [{ when: "anomaly", text: "{metric} is {ratio}x the 28-day average" }] },
    { id: "alert-late-delivery", kind: "alert", area: "delivery", title: "Late-delivery complaints",
      question: "Do recent reviews point to a late-delivery problem?" },
    // ...
  ],
  signals: [metricsSignal, navigationSignal, chatSignal, reviewsSignal],
  relevanceLevels: [
    "Nothing changed in this area and the owner showed no recent interest in it.",
    "The owner looked at or asked about this area recently, but the numbers are normal.",
    "Numbers moved out of the normal range, or it keeps coming up in reviews or chat.",
    "There is an active problem in this area that needs action today.",
  ],
  relevancePrompt: 'How important is it for the owner to see "{title}" today?',
});
```

On the server (planned API, milestone M1):

```ts
import { decide, MemoryStore } from "@reflexui-jev/core";
import { cloudflareDecider } from "@reflexui-jev/providers";

const { immediate, fresh } = decide({
  surface: home, ctx, subjectId: ctx.restaurantId,
  decider: cloudflareDecider(), store: new MemoryStore(),
});
```

On the client (planned API, milestone M1):

```tsx
const { decision, feedback } = useAdaptiveSurface({ surfaceId: "restaurant-home", subjectId, endpoint: "/api/surface" });
```

## Install

Pre-alpha: published under the `alpha` dist-tag.

```sh
pnpm add @reflexui-jev/core@alpha
pnpm add @reflexui-jev/providers@alpha   # optional: deciders
pnpm add @reflexui-jev/react@alpha react # optional: React bindings
```

## Packages

| Package | Purpose | Status |
| --- | --- | --- |
| [`@reflexui-jev/core`](packages/core) | Types, question builders, `defineSurface`, policy, `compose`, `decide`, stores | Types ready · logic M1 |
| [`@reflexui-jev/providers`](packages/providers) | Deciders for TypeSafe, Cloudflare, OpenRouter, an LLM fallback, and a deterministic mock | Mock ready · remote M0–M1 |
| [`@reflexui-jev/react`](packages/react) | Headless `useAdaptiveSurface`, feedback, debug panel | M1 |
| [`@reflexui-jev/replay`](packages/replay) | Offline replay: hit rate vs default order, latency, cost | M2 |

## Providers

| Provider | Model | Notes |
| --- | --- | --- |
| `typesafeDecider` | Jev (TypeSafe direct) | Early access |
| `cloudflareDecider` | `typesafe/jev` on Workers AI | Zero data retention |
| `openrouterDecider` | `typesafe/jev-1.13` | Decisions API |
| `llmDecider` | Any LLM with structured output | Slower, uncalibrated; for teams without Jev access |
| `mockDecider` | Deterministic hash | Runs examples and tests with no API key |

Configure keys in `.env` (see [.env.example](.env.example)).

## Examples

| Example | Domain | Shows |
| --- | --- | --- |
| [`examples/restaurant-kpis`](examples/restaurant-kpis) | Restaurant owner home: sales, delivery, dine-in, reviews, market | 19 cards, 5 alerts, 6 suggestions, 3 fictitious restaurants (delivery-first, dine-in bistro, 3-unit chain) |
| [`examples/saas-dashboard`](examples/saas-dashboard) | B2B SaaS admin home | Same core, different domain: proof that nothing is restaurant-specific |

## Design principles

1. **Known rules stay in code.** If a structured field decides it, it is an `if`, not a question.
2. **The model never computes.** Deltas, averages and dates are computed before the call.
3. **The model only chooses among what exists.** No model output becomes text on screen.
4. **Small context per call.** Each call gets only the signals its questions need.
5. **One question, one dimension.** Rubric levels describe situations, not adjectives.
6. **Stability over cleverness.** Fixed first scroll, few swaps per visit, hysteresis, pins.
7. **There is always a fallback.** Cache → default order → static screen. Never an empty slot.
8. **Every decision is explainable and logged.** Reasons come from templates; logs feed replay.

More: [docs/writing-questions.md](docs/writing-questions.md) · [docs/architecture.md](docs/architecture.md).

## Roadmap

| Milestone | Scope | Exit criterion |
| --- | --- | --- |
| **M0** Access | Remote deciders for TypeSafe and Cloudflare | Real answers from Jev in an integration test |
| **M1** Core + mock demo | `compose`, `decide`, `buildRequests`, React hook, debug panel, restaurant demo | Demo runs with `mockDecider`, no API key |
| **M2** Replay | `runReplay`, labeling format, report | Report shows hit rate vs default order |
| **M3** First production case | Integration behind a flag, feedback, logs | p95 ≤ 500 ms, no instability complaints |
| **M4** Field test | A/B against the static screen | Decision: ship, adjust or stop |

## Privacy

- Signals are summarized **before** leaving your system; send the smallest useful context.
- Remove personal data (names, phones, emails, tax ids, addresses) from chat and reviews first.
- Prefer providers with zero data retention.
- Replay datasets are git-ignored (`replay-data/`). Never commit real customer data.

Details: [docs/privacy.md](docs/privacy.md).

## Contributing

The API is still moving. Open an issue before large PRs. See [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
pnpm install
pnpm typecheck
```

## License

[MIT](LICENSE)

## Prior art

- [json-render + Jev](https://json-render.dev/docs/jev) (Vercel Labs): composes UI specs from candidates with Jev.
- [jev-ui](https://github.com/etweisberg/jev-ui): `<Branch>`, `<Rank>`, `<Gate>` components backed by Jev.
- [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (TypeSafe).

reflexui differs by adapting **over time and across signals** (navigation, conversations,
feedback, metrics), with stability rules and offline replay built in.
