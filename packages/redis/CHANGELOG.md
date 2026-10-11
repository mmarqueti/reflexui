# @reflexui-jev/redis

## 0.2.0

### Minor Changes

- b8b4e69: Implement `compose`, `buildRequests` and `decide` (now async), the NDJSON `decisionStream`, "not useful" feedback with demotion and `Decision.more`/`demoted`, the real `typesafeDecider` (`POST /v1/systemone`) and the `useAdaptiveSurface` hook. Implement `runReplay`, `cachingDecider`, `parseReplayCases` and `formatReport` in `@reflexui-jev/replay`. Adds the headless `<DebugPanel>` and an opt-in `trace` message in the decision stream; the hook also exposes `immediate`, `fresh`, `trace`, `freshAfterMs` and `refresh`, and accepts an extra `body`. Adds `@reflexui-jev/redis`: `redisStore` and `redisFeedbackStore` (ioredis, or node-redis via `fromNodeRedis`) so the cache and feedback are shared across instances. Adds unit tests for all five packages.

### Patch Changes

- Updated dependencies [b8b4e69]
  - @reflexui-jev/core@0.2.0
