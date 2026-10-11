# @reflexui-jev/react

Headless React bindings. You render the cards; the hook tells you which, in what order, and why.

| Export | Status |
| --- | --- |
| `useAdaptiveSurface({ surfaceId, subjectId, endpoint })` | ready |
| `feedback(itemId, useful)` for "Useful?" buttons | ready |
| `<DebugPanel trace policy>`: scoreboard, alert probabilities, model requests and answers | ready |

```tsx
const {
  decision,   // what to render now (immediate, then fresh if it lands in the window)
  immediate,  // the first decision received: cache, or default order
  fresh,      // the fresh decision, even when too late to apply
  deferred,   // set when the fresh decision missed the window; applyDeferred() applies it
  trace,      // model I/O and scoreboard, when the server streams it
  freshAfterMs, status, error, feedback, refresh,
} = useAdaptiveSurface({
  surfaceId: "home",
  subjectId,
  endpoint: "/api/surface", // POST { surfaceId, subjectId, ...body } -> NDJSON stream
  body: { env: "staging" }, // optional extra fields; changing it refetches
});
```

The endpoint streams the immediate decision first and the fresh one when the model answers
(`decisionStream` from core). The hook applies the fresh decision only if it lands within
`applyWithinMs` (default 300) of the request; otherwise it is exposed as `deferred`
(and the server has cached it for the next visit). `feedback(itemId, false)` posts to
`${endpoint}/feedback`.

Server side (any framework with Web `Response`):

```ts
const result = await decide({ surface, ctx, subjectId, decider, store, feedback });
return new Response(decisionStream(result), { headers: { "content-type": "application/x-ndjson" } });
```

### Debug panel

```tsx
import { DebugPanel, useAdaptiveSurface } from "@reflexui-jev/react";

const { trace } = useAdaptiveSurface({ /* ... */ });
<DebugPanel trace={trace} policy={surface.policy} />
```

Stream the trace with `decisionStream(result, { trace: true })`. The panel shows the source of the decision,
the relevance scoreboard against the policy (promoted, held back, below threshold), alert probabilities, and the
raw requests and answers. It is unstyled semantic HTML with `reflexui-debug-*` class names (or pass `className`).

> The trace contains the signals you send to the model, which may be customer data. Enable it in development
> or behind an admin check, never for end users.
