# @reflexui-jev/replay

Offline evaluation over labeled history. The go/no-go gate before users see anything.

- Input: `ReplayCase[]` (context at a moment + the items a human wanted on top).
- Output: hit rate vs the surface's `defaultOrder`, latency p50/p95, input tokens.

Status: M2.
