---
"@reflexui-jev/core": minor
"@reflexui-jev/providers": minor
"@reflexui-jev/react": minor
"@reflexui-jev/replay": minor
---

Implement `compose`, `buildRequests` and `decide` (now async), the NDJSON `decisionStream`, "not useful" feedback with demotion and `Decision.more`/`demoted`, the real `typesafeDecider` (`POST /v1/systemone`) and the `useAdaptiveSurface` hook. Implement `runReplay`, `cachingDecider`, `parseReplayCases` and `formatReport` in `@reflexui-jev/replay`. Adds the headless `<DebugPanel>` and an opt-in `trace` message in the decision stream; the hook also exposes `immediate`, `fresh`, `trace`, `freshAfterMs` and `refresh`, and accepts an extra `body`. Adds unit tests for all four packages.
