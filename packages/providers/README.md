# @reflexui-jev/providers

Implementations of the `Decider` interface.

| Decider | Backend | Status |
| --- | --- | --- |
| `mockDecider()` | Deterministic hash, optional overrides and latency | ready |
| `typesafeDecider()` | Jev via TypeSafe API (`POST /v1/systemone`, reads `TYPESAFE_API_KEY`) | ready |

Need another backend? A decider is just `{ name, evaluate(request) }` (the `Decider` interface from core), so you can
plug in your own.
