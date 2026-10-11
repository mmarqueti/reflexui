# @reflexui-jev/react

Headless React bindings. You render the cards; the hook tells you which, in what order, and why.

| Export | Status |
| --- | --- |
| `useAdaptiveSurface({ surfaceId, subjectId, endpoint })` | ready |
| `feedback(itemId, useful)` for "Useful?" buttons | ready |
| `<DebugPanel>`: state, questions, answers, policy decision | planned |

```tsx
const { decision, status, deferred, feedback, applyDeferred } = useAdaptiveSurface({
  surfaceId: "home",
  subjectId,
  endpoint: "/api/surface", // POST { surfaceId, subjectId } -> NDJSON stream
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
