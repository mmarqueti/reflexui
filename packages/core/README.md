# @reflexui-jev/core

Headless, domain-free core.

| Export | Status |
| --- | --- |
| Types: `SurfaceDefinition`, `SurfaceItem`, `SignalProvider`, `Question`, `Answer`, `Decider`, `Policy`, `Decision` | ready |
| `score()`, `choice()`, `noul()` question builders | ready |
| `defineSurface()`, `defaultPolicy` | ready |
| `buildReasons()` (templates + signal facts) | ready |
| `MemoryStore`, `MemoryLog` | ready |
| `defaultDecision()` | ready |
| `buildRequests()`, `compose()`, `composeWithTrace()`, `decide()` | ready |
| `decisionStream()`, `readDecisionStream()` (NDJSON: immediate first, fresh later, optional `trace`) | ready |
| `MemoryFeedbackStore`, `demotedItems()`: "not useful" demotes an item for `policy.demoteForMs` (7 days) | ready |
| `Decision.more` ("See all") and `Decision.demoted` | ready |

See [docs/concepts.md](../../docs/concepts.md).
