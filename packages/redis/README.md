# @reflexui-jev/redis

Redis-backed stores for reflexui. `MemoryStore` lives inside one process; with several instances or serverless
functions every visit would start from the default order and "not useful" feedback would be lost.
These stores keep both in Redis so all instances agree.

| Export | Replaces | Stores |
| --- | --- | --- |
| `redisStore(client, options?)` | `MemoryStore` (the `DecisionStore` passed to `decide()`) | The last decision per surface and subject, as JSON, with a TTL |
| `redisFeedbackStore(client, options?)` | `MemoryFeedbackStore` | One hash per subject, one field per item with the latest feedback |
| `fromNodeRedis(client)` | | Adapter for node-redis (the `redis` package) |

## Usage

With [ioredis](https://github.com/redis/ioredis) (works as is):

```ts
import Redis from "ioredis";
import { decide } from "@reflexui-jev/core";
import { redisStore, redisFeedbackStore } from "@reflexui-jev/redis";

const redis = new Redis(process.env.REDIS_URL!); // create it once, outside the request handler

const result = await decide({
  surface, ctx, subjectId, decider,
  store: redisStore(redis),
  feedback: redisFeedbackStore(redis),
});
```

With node-redis:

```ts
import { createClient } from "redis";
import { fromNodeRedis, redisStore, redisFeedbackStore } from "@reflexui-jev/redis";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
const redis = fromNodeRedis(client);
```

Other clients (Upstash, Valkey drivers, ...): implement the five-method `RedisClient` interface
(`get`, `set(key, value, "PX", ms)`, `hset`, `hgetall`, `pexpire`) and pass it in.

## Keys and expiry

| Key | Value | Default TTL |
| --- | --- | --- |
| `reflexui:decision:<surfaceId>:<subjectId>` | Decision JSON | 30 days |
| `reflexui:feedback:<surfaceId>:<subjectId>` | Hash `itemId -> latest feedback entry` | 30 days, refreshed on each write |

Change the prefix with `prefix` (use one per environment if they share a Redis). Keep decision `ttlMs` above
`policy.pinForMs` (24 h by default) so pins and the swap limit work between visits, and feedback `ttlMs` above
`policy.demoteForMs` (7 days) or demotions expire early.

## Notes

- Decisions are overwritten last-write-wins. If two requests for the same subject run at once, one result
  replaces the other; both are valid decisions, and the next visit composes on top of whichever survived.
- Feedback keeps only the latest entry per item. That is all `demotedItems()` reads, so nothing is lost for
  demotion. If you want the full history as replay labels, also write it to your own log.
- Decisions contain item ids, scores and reason sentences, not the raw signals sent to the model.
