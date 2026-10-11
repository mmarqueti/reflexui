# @reflexui-jev/replay

Offline evaluation over labeled history. The go/no-go gate before users see anything.

- Input: `ReplayCase[]` (context at a moment + the items a human wanted on top).
- Output: hit rate vs the surface's `defaultOrder`, latency p50/p95, input tokens.

```ts
const report = await runReplay({ surface, decider, cases }); // hit rate vs the default order
console.log(formatReport(report));
```

Also exported: `cachingDecider` (one model call per case across a threshold sweep) and
`parseReplayCases` (JSON Lines). Full guide: [docs/replay.md](../../docs/replay.md).
