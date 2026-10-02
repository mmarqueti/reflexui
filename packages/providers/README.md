# @reflexui/providers

Implementations of the `Decider` interface.

| Decider | Backend | Status |
| --- | --- | --- |
| `mockDecider()` | Deterministic hash, optional overrides and latency | ready |
| `typesafeDecider()` | Jev via TypeSafe API | M0 |
| `cloudflareDecider()` | `typesafe/jev` on Workers AI | M0 |
| `openrouterDecider()` | `typesafe/jev-1.13` on OpenRouter | M1 |
| `llmDecider()` | Any LLM with structured output (fallback) | M1 |
