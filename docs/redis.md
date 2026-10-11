# Why Redis

reflexui keeps a little state between visits. `MemoryStore` keeps it inside one process, which is fine for a demo and
wrong for most real deployments. `@reflexui-jev/redis` keeps the same state somewhere every instance can reach.
This page explains what that state is, what breaks without a shared store, and when you can skip Redis.

## The state `decide()` keeps

Two small pieces of state, both per subject (the account, store or user the surface adapts to):

| State | Interface | Written by | Read by |
| --- | --- | --- | --- |
| **The last decision** | `DecisionStore` (`get`, `set`) | `decide()` after every fresh decision | `decide()` on the next visit |
| **"Not useful" feedback** | `FeedbackStore` (`record`, `list`) | Your feedback endpoint (the hook's `feedback()`) | `decide()` when composing |

The last decision is used three ways:

1. **Instant render.** On the next visit it is returned as `immediate` (`source: "cache"`) with no wait on the model.
   Without it the first paint is always the default order.
2. **Stability.** `compose` takes it as `previous`. The swap limit (`maxSwapsPerVisit`), the hysteresis and the pins
   (`pinForMs`) only make sense relative to what the user saw last time.
3. **Refresh throttle.** `decide()` skips the model call when the last decision is younger than `minRefreshMs`
   (10 minutes by default), which keeps the cost and the load down.

Feedback is how a 👎 demotes an item for `demoteForMs` (7 days by default).

## What breaks without a shared store

`MemoryStore` is a `Map` in the memory of one process. With more than one process, or a process that does not live
long, the state is simply not there when the next request arrives.

| Deployment | What happens with `MemoryStore` |
| --- | --- |
| **Serverless** (Vercel, Lambda, Workers) | Every cold start has an empty store. `immediate` is always the default order, `previous` is always missing, so every visit is treated as a first visit |
| **Several instances behind a load balancer** | Each instance has its own cache. Consecutive visits can hit different instances and see different "last decisions" |
| **Restarts and deploys** | Everything is forgotten, including the feedback |

And the consequences for the product:

- **The screen jumps around.** With no `previous`, `compose` places the full target on every visit: no swap limit, no
  hysteresis, no pins. The stability rules that make the screen feel calm quietly stop applying.
- **Feedback is lost.** A user marks a card as not useful and it comes back on the next visit, because the request landed on
  another instance or the process restarted.
- **The model is called on every visit.** The `minRefreshMs` throttle depends on the last decision's timestamp. Without it
  you pay for (and wait on) a call each time.
- **No instant render.** The "never block on the model" promise holds, but what renders is always the generic default order
  instead of the personalized last decision.

None of this fails loudly. Everything still renders and nothing throws; the adaptive behavior just degrades into
a screen that looks random and costs more. That is why it is worth settling before production.

## What goes into Redis

```
reflexui:decision:<surfaceId>:<subjectId>   string   Decision as JSON, TTL 30 days
reflexui:feedback:<surfaceId>:<subjectId>   hash     itemId -> latest feedback entry, TTL 30 days (refreshed on write)
```

- A **decision** has the ids, scores, confidences and reason sentences that were shown, plus the pins. It does **not** contain
  the raw signals sent to the model. Reason sentences are filled from your facts, so they can carry numbers
  (for example "Billing metrics are 2.6x the 28-day average").
- **Feedback** has the subject id, the item id, the `useful` flag and a timestamp.
- Both are small (a few KB at most) and expire on their own.

## Why a separate package

- The core stays free of dependencies, and `MemoryStore` stays available for tests and demos.
- The package does not depend on a Redis client. It takes yours (`ioredis` as is, node-redis through `fromNodeRedis`),
  so it uses your connection settings, pooling and version.
- Only five commands are used (`get`, `set ... PX`, `hset`, `hgetall`, `pexpire`), so wrapping another client is a few lines.

## Design choices

| Choice | Reason |
| --- | --- |
| Decisions are overwritten, last write wins | Two concurrent requests for one subject both produce valid decisions. The next visit composes on top of whichever survived. A lock would add latency for no real gain |
| One field per item in the feedback hash | `demotedItems()` only reads the latest entry per item, so overwriting loses nothing, and a hash write is atomic per item |
| TTLs on everything | State does not pile up for subjects that left. Decisions only need to outlive `pinForMs`, feedback only `demoteForMs` |
| Store errors never reach the user | `decide()` catches failures from `get`, `set` and `list`. If Redis is down, `immediate` falls back to the default order and the visit goes on |

If Redis is down you get the "without a shared store" behavior above, for as long as it is down. The screen still renders.

## When you do not need it

- **A single long-lived server process** where losing state on restart is acceptable (internal tools, small apps).
- **Local development, demos, tests.** `MemoryStore` and `MemoryFeedbackStore` are what they are for.
- **You already have your own storage.** `DecisionStore` and `FeedbackStore` are two-method interfaces. A table in Postgres, a KV
  namespace or DynamoDB works the same way. Redis is the shipped adapter, not the only option.

## Setup

See [`packages/redis`](../packages/redis/README.md) for the usage snippets. In short:

```ts
const redis = new Redis(process.env.REDIS_URL!); // once, outside the request handler

await decide({
  surface, ctx, subjectId, decider,
  store: redisStore(redis),
  feedback: redisFeedbackStore(redis),
});
```

Use one `prefix` per environment if staging and production share a Redis, and keep `ttlMs` above `policy.pinForMs` for decisions
and above `policy.demoteForMs` for feedback.
